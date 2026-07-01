export const APPROVED_PRODUCT_PAIRS = [
  { mainProductId: "9213557440730", appleCareProductId: "9354604773594" },
  { mainProductId: "9142178611418", appleCareProductId: "9354605265114" },
  { mainProductId: "9150929862874", appleCareProductId: "9354605658330" },
  { mainProductId: "9146880032986", appleCareProductId: "9354606280922" },
  { mainProductId: "9151272091866", appleCareProductId: "9354607231194" },
  { mainProductId: "9153037107418", appleCareProductId: "9354607919322" },
  { mainProductId: "9153042284762", appleCareProductId: "9345007780058" },
  { mainProductId: "9153046905050", appleCareProductId: "9354609262810" },
  { mainProductId: "9153047068890", appleCareProductId: "9354610344154" },
  { mainProductId: "9153244561626", appleCareProductId: "9354617225434" },
];

export const APPROVED_PRODUCT_VARIANT_MAPPINGS = [
  {
    productId: "9150929862874",
    productTitle: "15-inch MacBook Air M5-16GB",
    variantId: "47545473171674",
    variantTitle: "Silver / 512GB / Apple M5 chip with 10-core CPU and 8-core GPU",
    appleCareProductId: "9354605658330",
    appleCareProductTitle: "AppleCare+ for 15-inch MacBook Air (M5)",
    appleCareVariantId: "48090851410138",
    appleCareVariantTitle: "Default Title",
    appleCarePriceSnapshot: "939.97",
  },
  {
    productId: "9150929862874",
    productTitle: "15-inch MacBook Air M5-16GB",
    variantId: "47545473237210",
    variantTitle: "Midnight / 512GB / Apple M5 chip with 10-core CPU and 8-core GPU",
    appleCareProductId: "9354605658330",
    appleCareProductTitle: "AppleCare+ for 15-inch MacBook Air (M5)",
    appleCareVariantId: "48090851410138",
    appleCareVariantTitle: "Default Title",
    appleCarePriceSnapshot: "939.97",
  },
  {
    productId: "9150929862874",
    productTitle: "15-inch MacBook Air M5-16GB",
    variantId: "47545473302746",
    variantTitle: "starlight / 512GB / Apple M5 chip with 10-core CPU and 8-core GPU",
    appleCareProductId: "9354605658330",
    appleCareProductTitle: "AppleCare+ for 15-inch MacBook Air (M5)",
    appleCareVariantId: "48090851410138",
    appleCareVariantTitle: "Default Title",
    appleCarePriceSnapshot: "939.97",
  },
  {
    productId: "9150929862874",
    productTitle: "15-inch MacBook Air M5-16GB",
    variantId: "47545473368282",
    variantTitle: "sky Blue / 512GB / Apple M5 chip with 10-core CPU and 8-core GPU",
    appleCareProductId: "9354605658330",
    appleCareProductTitle: "AppleCare+ for 15-inch MacBook Air (M5)",
    appleCareVariantId: "48090851410138",
    appleCareVariantTitle: "Default Title",
    appleCarePriceSnapshot: "939.97",
  },
];

export const APPROVED_BUNDLE_VARIANT_MAPPINGS = [
  {
    bundleProductId: "9345298792666",
    bundleProductTitle: "Primary Years Learning Bundle",
    bundleVariantId: "48064420020442",
    bundleVariantTitle: "Default Title",
    appleCareProductId: "9354607919322",
    appleCareProductTitle: "AppleCare+ for iPad (A16)",
    appleCareVariantId: "48090854981850",
    appleCareVariantTitle: "Default Title",
    appleCarePriceSnapshot: "284.7800",
    forDevice: "iPad 11-inch",
    note: "Primary Years Learning Bundle includes iPad 11-inch",
  },
];

export function toProductGid(productId) {
  return `gid://shopify/Product/${productId}`;
}

export function toVariantGid(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}
