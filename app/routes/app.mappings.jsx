import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function clean(value) {
  return String(value || "").trim();
}

function getBoolean(formData, name) {
  return formData.get(name) === "on";
}

async function getPricingOrThrow(pricingId) {
  const id = Number(pricingId);
  if (!Number.isInteger(id)) {
    throw new Error("Select a valid AppleCare pricing row.");
  }

  const pricing = await prisma.appleCarePricing.findUnique({ where: { id } });
  if (!pricing) {
    throw new Error("Selected AppleCare pricing row does not exist.");
  }

  return pricing;
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

function getMappingInput(formData) {
  const input = {
    shopifyProductId: clean(formData.get("shopifyProductId")),
    shopifyProductTitle: clean(formData.get("shopifyProductTitle")),
    shopifyVariantId: clean(formData.get("shopifyVariantId")),
    shopifyVariantTitle: clean(formData.get("shopifyVariantTitle")),
    shopifySku: clean(formData.get("shopifySku")),
    appleCarePricingId: formData.get("appleCarePricingId"),
    isActive: getBoolean(formData, "isActive"),
  };

  if (!input.shopifyProductId) throw new Error("Shopify product ID is required.");
  if (!input.shopifyProductTitle) throw new Error("Shopify product title is required.");
  if (!input.shopifyVariantId) throw new Error("Shopify variant ID is required.");

  return input;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const [pricingRows, mappings] = await Promise.all([
    prisma.appleCarePricing.findMany({ orderBy: { partNumber: "asc" } }),
    prisma.appleCareProductMapping.findMany({
      where: { shop: session.shop },
      include: { appleCarePricing: true },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  return {
    pricingRows: pricingRows.map((row) => ({
      id: row.id,
      partNumber: row.partNumber,
      description: row.description,
      sellWithVat: row.sellWithVat.toString(),
    })),
    mappings: mappings.map((mapping) => ({
      id: mapping.id,
      shopifyProductId: mapping.shopifyProductId,
      shopifyProductTitle: mapping.shopifyProductTitle,
      shopifyVariantId: mapping.shopifyVariantId,
      shopifyVariantTitle: mapping.shopifyVariantTitle || "",
      shopifySku: mapping.shopifySku || "",
      appleCarePricingId: mapping.appleCarePricingId,
      appleCarePartNumber: mapping.appleCarePartNumber,
      appleCareDescription: mapping.appleCarePricing.description,
      isActive: mapping.isActive,
      updatedAt: mapping.updatedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      const input = getMappingInput(formData);
      const pricing = await getPricingOrThrow(input.appleCarePricingId);

      if (input.isActive) {
        await assertNoActiveDuplicate({
          shop: session.shop,
          shopifyVariantId: input.shopifyVariantId,
        });
      }

      await prisma.appleCareProductMapping.create({
        data: {
          shop: session.shop,
          shopifyProductId: input.shopifyProductId,
          shopifyProductTitle: input.shopifyProductTitle,
          shopifyVariantId: input.shopifyVariantId,
          shopifyVariantTitle: input.shopifyVariantTitle || null,
          shopifySku: input.shopifySku || null,
          appleCarePricingId: pricing.id,
          appleCarePartNumber: pricing.partNumber,
          isActive: input.isActive,
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
      const pricing = await getPricingOrThrow(input.appleCarePricingId);

      if (input.isActive) {
        await assertNoActiveDuplicate({
          shop: session.shop,
          shopifyVariantId: input.shopifyVariantId,
          excludeId: id,
        });
      }

      await prisma.appleCareProductMapping.update({
        where: { id },
        data: {
          shopifyProductId: input.shopifyProductId,
          shopifyProductTitle: input.shopifyProductTitle,
          shopifyVariantId: input.shopifyVariantId,
          shopifyVariantTitle: input.shopifyVariantTitle || null,
          shopifySku: input.shopifySku || null,
          appleCarePricingId: pricing.id,
          appleCarePartNumber: pricing.partNumber,
          isActive: input.isActive,
        },
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

function PricingSelect({ pricingRows, defaultValue }) {
  return (
    <select name="appleCarePricingId" defaultValue={defaultValue || ""} required>
      <option value="" disabled>
        Select AppleCare price
      </option>
      {pricingRows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.partNumber} - {row.description}
        </option>
      ))}
    </select>
  );
}

function MappingFields({ pricingRows, mapping }) {
  return (
    <s-stack gap="small">
      <label>
        Shopify product ID
        <input
          name="shopifyProductId"
          defaultValue={mapping?.shopifyProductId || ""}
          required
        />
      </label>
      <label>
        Shopify product title
        <input
          name="shopifyProductTitle"
          defaultValue={mapping?.shopifyProductTitle || ""}
          required
        />
      </label>
      <label>
        Shopify variant ID
        <input
          name="shopifyVariantId"
          defaultValue={mapping?.shopifyVariantId || ""}
          required
        />
      </label>
      <label>
        Shopify variant title
        <input
          name="shopifyVariantTitle"
          defaultValue={mapping?.shopifyVariantTitle || ""}
        />
      </label>
      <label>
        Shopify SKU
        <input name="shopifySku" defaultValue={mapping?.shopifySku || ""} />
      </label>
      <label>
        AppleCare pricing
        <PricingSelect
          pricingRows={pricingRows}
          defaultValue={mapping?.appleCarePricingId}
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
  const { pricingRows, mappings } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="AppleCare Mappings">
      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      ) : null}

      <s-section heading="Create mapping">
        {pricingRows.length === 0 ? (
          <s-paragraph>Import AppleCare pricing before creating mappings.</s-paragraph>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <MappingFields pricingRows={pricingRows} />
            <button type="submit">Create mapping</button>
          </Form>
        )}
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
                      {mapping.isActive ? "Active" : "Inactive"} mapping to {mapping.appleCarePartNumber}
                    </s-paragraph>
                    <MappingFields pricingRows={pricingRows} mapping={mapping} />
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
