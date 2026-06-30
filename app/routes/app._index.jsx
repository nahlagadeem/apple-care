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
              AppleCare+ is now available as an add-on option for approved products and approved bundle products on
              the storefront. Customers can select AppleCare+ while adding eligible items to cart, and the AppleCare+
              item is added as a real Shopify line item linked to the parent product or bundle.
            </s-paragraph>
          </s-box>

          <s-box>
            <s-heading>Service coverage</s-heading>
            <s-unordered-list>
              <s-list-item>Product page AppleCare+ offer card</s-list-item>
              <s-list-item>Quick-view AppleCare+ option on collection product popups</s-list-item>
              <s-list-item>Approved standalone product and bundle mappings</s-list-item>
              <s-list-item>Cart quantity sync between parent item and AppleCare+</s-list-item>
              <s-list-item>Hidden AppleCare+ backend products that remain cart-addable</s-list-item>
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
