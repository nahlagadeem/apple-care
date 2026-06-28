import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function formatMoney(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const pricingRows = await prisma.appleCarePricing.findMany({
    orderBy: { partNumber: "asc" },
  });

  return {
    pricingRows: pricingRows.map((row) => ({
      id: row.id,
      partNumber: row.partNumber,
      description: row.description,
      sell: row.sell.toString(),
      sellWithVat: row.sellWithVat.toString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
};

export default function PricingPage() {
  const { pricingRows } = useLoaderData();

  return (
    <s-page heading="AppleCare Pricing">
      <s-section heading="Imported pricing rows">
        {pricingRows.length === 0 ? (
          <s-paragraph>No AppleCare pricing rows imported yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Part#</s-table-header>
              <s-table-header>Description</s-table-header>
              <s-table-header>Sell</s-table-header>
              <s-table-header>Sell with VAT</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {pricingRows.map((row) => (
                <s-table-row key={row.id}>
                  <s-table-cell>{row.partNumber}</s-table-cell>
                  <s-table-cell>{row.description}</s-table-cell>
                  <s-table-cell>{formatMoney(row.sell)}</s-table-cell>
                  <s-table-cell>{formatMoney(row.sellWithVat)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
