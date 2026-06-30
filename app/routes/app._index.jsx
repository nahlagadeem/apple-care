import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function AppHome() {
  return (
    <s-page heading="Apple Care">
      <s-section heading="AppleCare+ add-on service">
        <s-stack gap="base">
          <s-box>
            <s-heading>Available on the storefront</s-heading>
            <s-paragraph>
              AppleCare+ is now available for eligible products on the storefront. Customers can choose AppleCare+
              before adding a product to cart.
            </s-paragraph>
          </s-box>

          <s-box>
            <s-heading>Where it appears</s-heading>
            <s-unordered-list>
              <s-list-item>Product pages</s-list-item>
              <s-list-item>Quick-view product popups</s-list-item>
              <s-list-item>Eligible bundle products</s-list-item>
              <s-list-item>Cart and checkout after the customer selects AppleCare+</s-list-item>
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
