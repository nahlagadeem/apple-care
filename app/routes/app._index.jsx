import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function AppHome() {
  return (
    <s-page heading="Apple Care">
      <s-section heading="Status">
        <s-stack gap="base">
          <s-box>
            <s-heading>Implemented</s-heading>
            <s-unordered-list>
              <s-list-item>Shopify app scaffold</s-list-item>
              <s-list-item>Render deployment</s-list-item>
              <s-list-item>Prisma PostgreSQL setup</s-list-item>
              <s-list-item>AppleCarePricing model and migration</s-list-item>
              <s-list-item>Excel import script</s-list-item>
              <s-list-item>Admin Pricing page</s-list-item>
              <s-list-item>Main variant to AppleCare Shopify variant mapping page</s-list-item>
              <s-list-item>Admin auto-generation for AppleCare mappings</s-list-item>
            </s-unordered-list>
          </s-box>

          <s-box>
            <s-heading>Not implemented yet</s-heading>
            <s-unordered-list>
              <s-list-item>Storefront product page UI</s-list-item>
              <s-list-item>Product card UI</s-list-item>
              <s-list-item>Cart add-on logic</s-list-item>
              <s-list-item>Checkout behavior</s-list-item>
            </s-unordered-list>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
