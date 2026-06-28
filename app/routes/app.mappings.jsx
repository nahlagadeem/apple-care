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
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
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
