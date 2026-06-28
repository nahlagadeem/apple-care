import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { authenticate } from "./shopify.server";

function clean(value) {
  return String(value || "").trim();
}

const PRODUCT_QUERY = `#graphql
  query AppleCareProducts($id: ID!) {
    node(id: $id) {
      ... on Product {
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

const APPROVED_PRODUCT_PAIRS = [
  { mainProductId: "9213557440730", appleCareProductId: "9354604773594" },
  { mainProductId: "9142178611418", appleCareProductId: "9354605265114" },
  { mainProductId: "9146880032986", appleCareProductId: "9354606280922" },
  { mainProductId: "9151272091866", appleCareProductId: "9354607231194" },
  { mainProductId: "9153037107418", appleCareProductId: "9354607919322" },
  { mainProductId: "9153042284762", appleCareProductId: "9345007780058" },
  { mainProductId: "9153046905050", appleCareProductId: "9354609262810" },
  { mainProductId: "9153047068890", appleCareProductId: "9354610344154" },
  { mainProductId: "9153244561626", appleCareProductId: "9354617225434" },
];

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

function toProductGid(productId) {
  return `gid://shopify/Product/${productId}`;
}

async function fetchProductById(admin, productId) {
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: toProductGid(productId) },
  });
  const payload = await response.json();

  if (payload.errors) {
    throw new Error(`Shopify product fetch failed for ${productId}.`);
  }

  const product = payload.data.node;
  if (!product) {
    throw new Error(`Shopify product not found for ${productId}.`);
  }

  return product;
}

function buildSeedMappings(mainProduct, appleCareProduct, appleCareVariant) {
  return mainProduct.variants.nodes.map((mainVariant) => ({
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
  }));
}

async function seedApprovedMappings({ admin, shop }) {
  const pairResults = await Promise.all(
    APPROVED_PRODUCT_PAIRS.map(async (pair) => {
      const [mainProduct, appleCareProduct] = await Promise.all([
        fetchProductById(admin, pair.mainProductId),
        fetchProductById(admin, pair.appleCareProductId),
      ]);

      if (appleCareProduct.variants.nodes.length !== 1) {
        throw new Error(
          `AppleCare product ${appleCareProduct.title} must have exactly one variant for seeding.`,
        );
      }

      const appleCareVariant = appleCareProduct.variants.nodes[0];
      return {
        mainProduct,
        appleCareProduct,
        appleCareVariant,
        mappings: buildSeedMappings(mainProduct, appleCareProduct, appleCareVariant),
      };
    }),
  );

  const mappingRows = pairResults.flatMap((result) => result.mappings);
  const removedMappings = await prisma.$transaction(async (tx) => {
    const deleted = await tx.appleCareProductMapping.deleteMany({
      where: { shop },
    });

    if (mappingRows.length > 0) {
      await tx.appleCareProductMapping.createMany({
        data: mappingRows,
      });
    }

    return deleted.count;
  });

  return {
    approvedPairs: pairResults.length,
    mappingsRemoved: removedMappings,
    mappingsCreated: mappingRows.length,
    seededPairs: pairResults.map((result) => ({
      mainProductTitle: result.mainProduct.title,
      appleCareProductTitle: result.appleCareProduct.title,
      mainVariantCount: result.mainProduct.variants.nodes.length,
      mappingCount: result.mappings.length,
    })),
  };
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
    if (intent === "seedApprovedMappings") {
      const summary = await seedApprovedMappings({ admin, shop: session.shop });
      return {
        ok: true,
        message: `Seeded ${summary.mappingsCreated} variant mappings across ${summary.approvedPairs} approved pairs.`,
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

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
