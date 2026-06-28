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
        <s-paragraph>
          Apple Care app scaffold is ready. Pricing import, product mapping, cart logic, and storefront UI are intentionally not implemented yet.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
