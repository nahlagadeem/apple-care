import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const APPLE_CARE_VARIANT_QUERY = `#graphql
  query AppleCareLookupVariant($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        id
        title
        sku
        price
        product {
          id
          title
        }
      }
    }
  }
`;

function normalizeVariantId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return `gid://shopify/ProductVariant/${raw}`;
  }

  const gidMatch = raw.match(/^gid:\/\/shopify\/ProductVariant\/(\d+)$/);
  if (gidMatch) {
    return `gid://shopify/ProductVariant/${gidMatch[1]}`;
  }

  return null;
}

function errorResponse(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}

export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const variantIdParam = url.searchParams.get("variantId");
    const variantId = normalizeVariantId(variantIdParam);

    if (!variantIdParam) {
      return errorResponse("variantId is required.", 400);
    }

    if (!variantId) {
      return errorResponse(
        "variantId must be a numeric Shopify variant ID or a gid://shopify/ProductVariant/... value.",
        400,
      );
    }

    const shop = session?.shop || url.searchParams.get("shop");

    if (!shop) {
      return errorResponse("Shop context is missing from the app proxy request.", 400);
    }

    const mapping = await prisma.appleCareProductMapping.findFirst({
      where: {
        shop,
        shopifyVariantId: variantId,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!mapping) {
      return Response.json({ ok: true, hasAppleCare: false });
    }

    let appleCare = {
      productId: mapping.appleCareProductId || "",
      productTitle: mapping.appleCareProductTitle || "",
      variantId: mapping.appleCareVariantId || "",
      variantTitle: mapping.appleCareVariantTitle || "",
      sku: mapping.appleCareSku || "",
      price: mapping.appleCarePriceSnapshot?.toString() || "",
    };

    if (admin && mapping.appleCareVariantId) {
      const response = await admin.graphql(APPLE_CARE_VARIANT_QUERY, {
        variables: { id: mapping.appleCareVariantId },
      });
      const payload = await response.json();

      if (!payload.errors && payload.data?.node) {
        const node = payload.data.node;
        appleCare = {
          productId: node.product?.id || appleCare.productId,
          productTitle: node.product?.title || appleCare.productTitle,
          variantId: node.id || appleCare.variantId,
          variantTitle: node.title || appleCare.variantTitle,
          sku: node.sku || appleCare.sku,
          price: node.price || appleCare.price,
        };
      }
    }

    return Response.json({
      ok: true,
      hasAppleCare: true,
      appleCare,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return errorResponse("Unable to look up AppleCare mapping.", 500);
  }
};
