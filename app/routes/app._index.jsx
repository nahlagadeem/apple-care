import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function AppHome() {
  return (
    <s-page heading="Apple Care">
      <s-section>
        <s-paragraph>AppleCare+ is now available in the storefront.</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
