import path from "node:path";
import process from "node:process";
import { PrismaClient, Prisma } from "@prisma/client";
import xlsx from "xlsx";

const { readFile, utils } = xlsx;

const prisma = new PrismaClient();

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDecimal(value, fieldName, rowNumber) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing ${fieldName} at row ${rowNumber}`);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${fieldName} at row ${rowNumber}: ${value}`);
  }

  if (numeric < 0) {
    throw new Error(`Invalid negative ${fieldName} at row ${rowNumber}: ${value}`);
  }

  return new Prisma.Decimal(numeric.toFixed(4));
}

function getCell(row, columnIndex) {
  return row[columnIndex];
}

function readPricingRows(filePath) {
  const workbook = readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const header = rows[0] || [];
  const columnByHeader = new Map(
    header.map((value, index) => [normalizeHeader(value), index]),
  );

  const requiredColumns = {
    partNumber: "part#",
    description: "discription",
    sell: "sell",
    sellWithVat: "sell with vat",
  };

  for (const label of Object.values(requiredColumns)) {
    if (!columnByHeader.has(label)) {
      throw new Error(`Missing required Excel column: ${label}`);
    }
  }

  return rows
    .slice(1)
    .map((row, index) => {
      const rowNumber = index + 2;
      const partNumber = String(
        getCell(row, columnByHeader.get(requiredColumns.partNumber)),
      ).trim();
      const description = String(
        getCell(row, columnByHeader.get(requiredColumns.description)),
      ).trim();

      if (!partNumber && !description) return null;
      if (!partNumber) throw new Error(`Missing Part# at row ${rowNumber}`);
      if (!description) throw new Error(`Missing Discription at row ${rowNumber}`);

      return {
        partNumber,
        description,
        sell: normalizeDecimal(
          getCell(row, columnByHeader.get(requiredColumns.sell)),
          "Sell",
          rowNumber,
        ),
        sellWithVat: normalizeDecimal(
          getCell(row, columnByHeader.get(requiredColumns.sellWithVat)),
          "Sell with Vat",
          rowNumber,
        ),
      };
    })
    .filter(Boolean);
}

async function main() {
  const rawFilePath = process.argv[2] || process.env.APPLE_CARE_PRICING_FILE;
  if (!rawFilePath) {
    throw new Error(
      "Missing AppleCare pricing workbook path. Set APPLE_CARE_PRICING_FILE or pass the path as the first argument.",
    );
  }

  const filePath = path.resolve(rawFilePath);
  const pricingRows = readPricingRows(filePath);

  let upserted = 0;
  for (const row of pricingRows) {
    await prisma.appleCarePricing.upsert({
      where: { partNumber: row.partNumber },
      update: {
        description: row.description,
        sell: row.sell,
        sellWithVat: row.sellWithVat,
      },
      create: row,
    });
    upserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        filePath,
        rowsRead: pricingRows.length,
        rowsUpserted: upserted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
