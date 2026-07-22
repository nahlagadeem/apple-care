import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  APPROVED_BUNDLE_VARIANT_MAPPINGS,
  APPROVED_PRODUCT_VARIANT_MAPPINGS,
  toProductGid,
  toVariantGid,
} from "../approved-apple-care-mappings.server";

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

function getApprovedBundleMapping(variantId) {
  const mapping = APPROVED_BUNDLE_VARIANT_MAPPINGS.find(
    (item) => toVariantGid(item.bundleVariantId) === variantId,
  );

  if (!mapping) return null;

  return {
    shopifyProductId: toProductGid(mapping.bundleProductId),
    shopifyProductTitle: mapping.bundleProductTitle,
    shopifyVariantId: toVariantGid(mapping.bundleVariantId),
    shopifyVariantTitle: mapping.bundleVariantTitle,
    appleCareProductId: toProductGid(mapping.appleCareProductId),
    appleCareProductTitle: mapping.appleCareProductTitle,
    appleCareVariantId: toVariantGid(mapping.appleCareVariantId),
    appleCareVariantTitle: mapping.appleCareVariantTitle,
    appleCareSku: "",
    appleCarePriceSnapshot: mapping.appleCarePriceSnapshot,
    forDevice: mapping.forDevice,
  };
}

function getApprovedProductVariantMapping(variantId) {
  const mapping = APPROVED_PRODUCT_VARIANT_MAPPINGS.find(
    (item) => toVariantGid(item.variantId) === variantId,
  );

  if (!mapping) return null;

  return {
    shopifyProductId: toProductGid(mapping.productId),
    shopifyProductTitle: mapping.productTitle,
    shopifyVariantId: toVariantGid(mapping.variantId),
    shopifyVariantTitle: mapping.variantTitle,
    appleCareProductId: toProductGid(mapping.appleCareProductId),
    appleCareProductTitle: mapping.appleCareProductTitle,
    appleCareVariantId: toVariantGid(mapping.appleCareVariantId),
    appleCareVariantTitle: mapping.appleCareVariantTitle,
    appleCareSku: "",
    appleCarePriceSnapshot: mapping.appleCarePriceSnapshot,
  };
}

export const loader = async ({ request }) => {
  try {
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

    let admin = null;
    let session = null;
    try {
      ({ admin, session } = await authenticate.public.appProxy(request));
    } catch (error) {
      console.warn("[AppleCare lookup] App proxy authentication failed; using approved mappings only.", {
        status: error instanceof Response ? error.status : undefined,
      });
    }

    const shop = session?.shop || url.searchParams.get("shop");
    const approvedMapping = getApprovedProductVariantMapping(variantId) || getApprovedBundleMapping(variantId);

    let dbMapping = null;
    if (shop) {
      try {
        dbMapping = await prisma.appleCareProductMapping.findFirst({
          where: {
            shop,
            shopifyVariantId: variantId,
            isActive: true,
          },
          orderBy: { updatedAt: "desc" },
        });
      } catch (error) {
        console.error("[AppleCare lookup] Database mapping lookup failed; using approved mapping fallback.", error);
      }
    }

    const mapping = dbMapping || approvedMapping;

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
      try {
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
            forDevice: mapping.forDevice || appleCare.forDevice,
          };
        }
      } catch (error) {
        console.error("[AppleCare lookup] AppleCare variant refresh failed; using mapped snapshot.", error);
      }
    }

    return Response.json({
      ok: true,
      hasAppleCare: true,
      appleCare: {
        ...appleCare,
        forDevice: mapping.forDevice || appleCare.forDevice,
      },
    });
  } catch (error) {
    console.error("[AppleCare lookup] Unexpected lookup failure.", error);
    return errorResponse("Unable to look up AppleCare mapping.", 500);
  }
};
