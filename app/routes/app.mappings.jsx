import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

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
        <s-section heading="Approved seed result">
          <s-stack gap="small">
            <s-paragraph>Approved pairs: {actionData.summary.approvedPairs}</s-paragraph>
            <s-paragraph>Mappings removed: {actionData.summary.mappingsRemoved}</s-paragraph>
            <s-paragraph>Variant mappings created: {actionData.summary.mappingsCreated}</s-paragraph>
          </s-stack>

          {actionData.summary.seededPairs?.length > 0 ? (
            <s-box>
              <s-heading>Seeded product pairs</s-heading>
              <s-unordered-list>
                {actionData.summary.seededPairs.map((item) => (
                  <s-list-item key={`${item.mainProductTitle}-${item.appleCareProductTitle}`}>
                    {item.mainProductTitle} to {item.appleCareProductTitle} ({item.mappingCount} variants)
                  </s-list-item>
                ))}
              </s-unordered-list>
            </s-box>
          ) : null}
        </s-section>
      ) : null}

      <s-section heading="Seed approved mappings">
        <Form method="post">
          <input type="hidden" name="intent" value="seedApprovedMappings" />
          <s-paragraph>
            Replaces the current mappings for this shop with the approved product pair seed and keeps manual review/edit/delete on this page.
          </s-paragraph>
          <button type="submit">Seed approved mappings</button>
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

export async function loader(args) {
  const { loader: serverLoader } = await import("../mappings.server.js");
  return serverLoader(args);
}

export async function action(args) {
  const { action: serverAction } = await import("../mappings.server.js");
  return serverAction(args);
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
