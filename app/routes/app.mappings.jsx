import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function clean(value) {
  return String(value || "").trim();
}

const PRODUCT_QUERY = `#graphql
  query AppleCareProducts($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        productType
        tags
        status
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price
            availableForSale
          }
        }
      }
    }
  }
`;

function getBoolean(formData, name) {
  return formData.get(name) === "on";
}

function normalizeOptionalPrice(value) {
  const raw = clean(value);
  if (!raw) return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("AppleCare price snapshot must be a non-negative number.");
  }

  return numeric.toFixed(4);
}

async function assertNoActiveDuplicate({ shop, shopifyVariantId, excludeId }) {
  const duplicate = await prisma.appleCareProductMapping.findFirst({
    where: {
      shop,
      shopifyVariantId,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  if (duplicate) {
    throw new Error("This Shopify variant already has an active AppleCare mapping.");
  }
}

function isAppleCareProduct(product) {
  const title = product.title.toLowerCase();
  const productType = String(product.productType || "").toLowerCase();
  const tags = product.tags.map((tag) => tag.toLowerCase());

  return (
    title.startsWith("applecare+") ||
    productType === "extended warranties" ||
    tags.some(
      (tag) =>
        tag.includes("applecare") ||
        tag.includes("apple-care") ||
        tag.includes("extended-warrant"),
    )
  );
}

function normalizeModelText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/applecare\+/g, "")
    .replace(/\bfor\b/g, " ")
    .replace(/\+/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\b\d+\s*(gb|tb)\b/g, " ")
    .replace(/\b\d+\s*gb\s*ram\b/g, " ")
    .replace(/\bwi[-\s]?fi\b/g, " ")
    .replace(/\bcellular\b/g, " ")
    .replace(/\bspace\b|\bgray\b|\bgrey\b|\bsilver\b|\bstarlight\b|\bmidnight\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getModelTokens(value) {
  return normalizeModelText(value)
    .split(" ")
    .filter((token) => token.length > 1 || /^[0-9]$/.test(token));
}

function tokenSetContainsAll(haystackTokens, needleTokens) {
  const haystack = new Set(haystackTokens);
  return needleTokens.length > 0 && needleTokens.every((token) => haystack.has(token));
}

function findAppleCareMatches(mainProduct, appleCareProducts) {
  const mainTokens = getModelTokens(mainProduct.title);
  const variantTokens = mainProduct.variants.nodes.flatMap((variant) =>
    getModelTokens(`${mainProduct.title} ${variant.title}`),
  );
  const allMainTokens = [...new Set([...mainTokens, ...variantTokens])];

  return appleCareProducts.filter((appleCareProduct) => {
    const appleCareTokens = getModelTokens(appleCareProduct.title);
    return (
      tokenSetContainsAll(allMainTokens, appleCareTokens) ||
      tokenSetContainsAll(appleCareTokens, mainTokens)
    );
  });
}

function getSinglePurchasableVariant(product) {
  const purchasableVariants = product.variants.nodes.filter(
    (variant) => variant.availableForSale,
  );

  if (purchasableVariants.length === 1) return purchasableVariants[0];

  return null;
}

async function fetchShopifyProducts(admin) {
  const products = [];
  let cursor = null;

  do {
    const response = await admin.graphql(PRODUCT_QUERY, {
      variables: { cursor },
    });
    const payload = await response.json();

    if (payload.errors) {
      throw new Error("Shopify product fetch failed.");
    }

    products.push(...payload.data.products.nodes);
    cursor = payload.data.products.pageInfo.hasNextPage
      ? payload.data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  return products;
}

async function autoGenerateMappings({ admin, shop }) {
  const products = await fetchShopifyProducts(admin);
  const appleCareProducts = products.filter(isAppleCareProduct);
  const mainProducts = products.filter((product) => !isAppleCareProduct(product));
  const activeMappings = await prisma.appleCareProductMapping.findMany({
    where: { shop, isActive: true },
    select: { shopifyVariantId: true },
  });
  const mappedVariantIds = new Set(
    activeMappings.map((mapping) => mapping.shopifyVariantId),
  );

  const summary = {
    productsScanned: products.length,
    appleCareProductsFound: appleCareProducts.length,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    unmatchedMainProducts: [],
    ambiguousMatches: [],
  };

  for (const mainProduct of mainProducts) {
    const matches = findAppleCareMatches(mainProduct, appleCareProducts);

    if (matches.length === 0) {
      summary.unmatchedMainProducts.push(mainProduct.title);
      continue;
    }

    if (matches.length > 1) {
      summary.ambiguousMatches.push({
        mainProduct: mainProduct.title,
        appleCareProducts: matches.map((match) => match.title),
      });
      continue;
    }

    const appleCareProduct = matches[0];
    const appleCareVariant = getSinglePurchasableVariant(appleCareProduct);

    if (!appleCareVariant) {
      summary.ambiguousMatches.push({
        mainProduct: mainProduct.title,
        appleCareProducts: [
          `${appleCareProduct.title} has ${appleCareProduct.variants.nodes.length} variants`,
        ],
      });
      continue;
    }

    for (const mainVariant of mainProduct.variants.nodes) {
      if (mappedVariantIds.has(mainVariant.id)) {
        summary.mappingsSkipped += 1;
        continue;
      }

      await prisma.appleCareProductMapping.create({
        data: {
          shop,
          shopifyProductId: mainProduct.id,
          shopifyProductTitle: mainProduct.title,
          shopifyVariantId: mainVariant.id,
          shopifyVariantTitle: mainVariant.title || null,
          shopifySku: mainVariant.sku || null,
          appleCareProductId: appleCareProduct.id,
          appleCareProductTitle: appleCareProduct.title,
          appleCareVariantId: appleCareVariant.id,
          appleCareVariantTitle: appleCareVariant.title || null,
          appleCareSku: appleCareVariant.sku || null,
          appleCarePriceSnapshot: appleCareVariant.price,
          isActive: true,
        },
      });
      mappedVariantIds.add(mainVariant.id);
      summary.mappingsCreated += 1;
    }
  }

  return summary;
}

function getMappingInput(formData) {
  const input = {
    shopifyProductId: clean(formData.get("shopifyProductId")),
    shopifyProductTitle: clean(formData.get("shopifyProductTitle")),
    shopifyVariantId: clean(formData.get("shopifyVariantId")),
    shopifyVariantTitle: clean(formData.get("shopifyVariantTitle")),
    shopifySku: clean(formData.get("shopifySku")),
    appleCareProductId: clean(formData.get("appleCareProductId")),
    appleCareProductTitle: clean(formData.get("appleCareProductTitle")),
    appleCareVariantId: clean(formData.get("appleCareVariantId")),
    appleCareVariantTitle: clean(formData.get("appleCareVariantTitle")),
    appleCareSku: clean(formData.get("appleCareSku")),
    appleCarePriceSnapshot: normalizeOptionalPrice(
      formData.get("appleCarePriceSnapshot"),
    ),
    isActive: getBoolean(formData, "isActive"),
  };

  if (!input.shopifyProductId) throw new Error("Main Shopify product ID is required.");
  if (!input.shopifyProductTitle) throw new Error("Main Shopify product title is required.");
  if (!input.shopifyVariantId) throw new Error("Main Shopify variant ID is required.");
  if (!input.appleCareProductId) throw new Error("AppleCare Shopify product ID is required.");
  if (!input.appleCareProductTitle) {
    throw new Error("AppleCare Shopify product title is required.");
  }
  if (!input.appleCareVariantId) {
    throw new Error("AppleCare Shopify variant ID is required.");
  }

  return input;
}

function serializeMapping(mapping) {
  return {
    id: mapping.id,
    shopifyProductId: mapping.shopifyProductId,
    shopifyProductTitle: mapping.shopifyProductTitle,
    shopifyVariantId: mapping.shopifyVariantId,
    shopifyVariantTitle: mapping.shopifyVariantTitle || "",
    shopifySku: mapping.shopifySku || "",
    appleCareProductId: mapping.appleCareProductId || "",
    appleCareProductTitle: mapping.appleCareProductTitle || "",
    appleCareVariantId: mapping.appleCareVariantId || "",
    appleCareVariantTitle: mapping.appleCareVariantTitle || "",
    appleCareSku: mapping.appleCareSku || "",
    appleCarePriceSnapshot: mapping.appleCarePriceSnapshot?.toString() || "",
    isActive: mapping.isActive,
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const mappings = await prisma.appleCareProductMapping.findMany({
    where: { shop: session.shop },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  return {
    mappings: mappings.map(serializeMapping),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "autoGenerate") {
      const summary = await autoGenerateMappings({ admin, shop: session.shop });
      return {
        ok: true,
        message: `Auto-generated ${summary.mappingsCreated} mappings. Skipped ${summary.mappingsSkipped}.`,
        summary,
      };
    }

    if (intent === "create") {
      const input = getMappingInput(formData);

      if (input.isActive) {
        await assertNoActiveDuplicate({
          shop: session.shop,
          shopifyVariantId: input.shopifyVariantId,
        });
      }

      await prisma.appleCareProductMapping.create({
        data: {
          shop: session.shop,
          ...input,
        },
      });

      return { ok: true, message: "Mapping created." };
    }

    if (intent === "update") {
      const id = Number(formData.get("id"));
      if (!Number.isInteger(id)) throw new Error("Invalid mapping ID.");

      const existing = await prisma.appleCareProductMapping.findFirst({
        where: { id, shop: session.shop },
      });
      if (!existing) throw new Error("Mapping was not found.");

      const input = getMappingInput(formData);

      if (input.isActive) {
        await assertNoActiveDuplicate({
          shop: session.shop,
          shopifyVariantId: input.shopifyVariantId,
          excludeId: id,
        });
      }

      await prisma.appleCareProductMapping.update({
        where: { id },
        data: input,
      });

      return { ok: true, message: "Mapping updated." };
    }

    if (intent === "deactivate") {
      const id = Number(formData.get("id"));
      if (!Number.isInteger(id)) throw new Error("Invalid mapping ID.");

      await prisma.appleCareProductMapping.updateMany({
        where: { id, shop: session.shop },
        data: { isActive: false },
      });

      return { ok: true, message: "Mapping deactivated." };
    }

    if (intent === "delete") {
      const id = Number(formData.get("id"));
      if (!Number.isInteger(id)) throw new Error("Invalid mapping ID.");

      await prisma.appleCareProductMapping.deleteMany({
        where: { id, shop: session.shop },
      });

      return { ok: true, message: "Mapping deleted." };
    }

    throw new Error("Unknown mapping action.");
  } catch (error) {
    return { ok: false, message: error.message };
  }
};

function MappingFields({ mapping }) {
  return (
    <s-stack gap="small">
      <s-heading>Main Shopify variant</s-heading>
      <label>
        Main product ID
        <input
          name="shopifyProductId"
          defaultValue={mapping?.shopifyProductId || ""}
          required
        />
      </label>
      <label>
        Main product title
        <input
          name="shopifyProductTitle"
          defaultValue={mapping?.shopifyProductTitle || ""}
          required
        />
      </label>
      <label>
        Main variant ID
        <input
          name="shopifyVariantId"
          defaultValue={mapping?.shopifyVariantId || ""}
          required
        />
      </label>
      <label>
        Main variant title
        <input
          name="shopifyVariantTitle"
          defaultValue={mapping?.shopifyVariantTitle || ""}
        />
      </label>
      <label>
        Main SKU
        <input name="shopifySku" defaultValue={mapping?.shopifySku || ""} />
      </label>

      <s-heading>AppleCare Shopify variant</s-heading>
      <label>
        AppleCare product ID
        <input
          name="appleCareProductId"
          defaultValue={mapping?.appleCareProductId || ""}
          required
        />
      </label>
      <label>
        AppleCare product title
        <input
          name="appleCareProductTitle"
          defaultValue={mapping?.appleCareProductTitle || ""}
          required
        />
      </label>
      <label>
        AppleCare variant ID
        <input
          name="appleCareVariantId"
          defaultValue={mapping?.appleCareVariantId || ""}
          required
        />
      </label>
      <label>
        AppleCare variant title
        <input
          name="appleCareVariantTitle"
          defaultValue={mapping?.appleCareVariantTitle || ""}
        />
      </label>
      <label>
        AppleCare SKU
        <input name="appleCareSku" defaultValue={mapping?.appleCareSku || ""} />
      </label>
      <label>
        AppleCare price snapshot
        <input
          name="appleCarePriceSnapshot"
          defaultValue={mapping?.appleCarePriceSnapshot || ""}
          inputMode="decimal"
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={mapping ? mapping.isActive : true}
        />{" "}
        Active
      </label>
    </s-stack>
  );
}

export default function MappingsPage() {
  const { mappings } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="AppleCare Mappings">
      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      ) : null}

      {actionData?.summary ? (
        <s-section heading="Auto-generation result">
          <s-stack gap="small">
            <s-paragraph>Products scanned: {actionData.summary.productsScanned}</s-paragraph>
            <s-paragraph>
              AppleCare products found: {actionData.summary.appleCareProductsFound}
            </s-paragraph>
            <s-paragraph>Mappings created: {actionData.summary.mappingsCreated}</s-paragraph>
            <s-paragraph>Mappings skipped: {actionData.summary.mappingsSkipped}</s-paragraph>
            <s-paragraph>
              Unmatched main products: {actionData.summary.unmatchedMainProducts.length}
            </s-paragraph>
            <s-paragraph>
              Ambiguous matches: {actionData.summary.ambiguousMatches.length}
            </s-paragraph>
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Auto-generate mappings">
        <Form method="post">
          <input type="hidden" name="intent" value="autoGenerate" />
          <s-paragraph>
            Matches main Shopify variants to existing AppleCare Shopify variants without overwriting active mappings.
          </s-paragraph>
          <button type="submit">Auto-generate mappings</button>
        </Form>
      </s-section>

      <s-section heading="Create mapping">
        <Form method="post">
          <input type="hidden" name="intent" value="create" />
          <MappingFields />
          <button type="submit">Create mapping</button>
        </Form>
      </s-section>

      <s-section heading="Existing mappings">
        {mappings.length === 0 ? (
          <s-paragraph>No product mappings created yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {mappings.map((mapping) => (
              <s-box key={mapping.id} borderWidth="base" borderRadius="base" padding="base">
                <Form method="post">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="id" value={mapping.id} />
                  <s-stack gap="small">
                    <s-heading>
                      {mapping.shopifyProductTitle} - {mapping.shopifyVariantTitle || mapping.shopifyVariantId}
                    </s-heading>
                    <s-paragraph>
                      {mapping.isActive ? "Active" : "Inactive"} mapping to {mapping.appleCareProductTitle || mapping.appleCareVariantId}
                    </s-paragraph>
                    <MappingFields mapping={mapping} />
                    <button type="submit">Save mapping</button>
                  </s-stack>
                </Form>

                <s-stack direction="inline" gap="small">
                  <Form method="post">
                    <input type="hidden" name="intent" value="deactivate" />
                    <input type="hidden" name="id" value={mapping.id} />
                    <button type="submit" disabled={!mapping.isActive}>
                      Deactivate
                    </button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={mapping.id} />
                    <button type="submit">Delete</button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
