import { describe, expect, it } from "vitest";

import {
  inferCapitalTransactionTerm,
  sumCapitalGainOrLoss,
  sumCapitalGainOrLossByTerm,
} from "./core-engine/income-capital";

describe("core-engine capital income helpers", () => {
  it("covers capital gain inference and term-based totals", () => {
    const brokerSourceDocuments = [
      {
        document_id: "doc_1099b_1",
        document_type: "FORM_1099_B",
        payload: {
          transactions: [
            {
              proceeds: 100,
              date_sold: "2025-02-01",
              date_acquired: "2023-01-01",
              term: "long",
            },
            {
              proceeds: 50,
              date_sold: "2025-02-01",
              date_acquired: "2024-08-01",
            },
            {
              date_sold: "2025-02-01",
            },
            {
              proceeds: 75,
              date_sold: "2025-02-01",
            },
          ],
        },
      },
    ];

    expect(
      sumCapitalGainOrLoss([
        {
          gain_or_loss: 10,
          proceeds: 10,
        },
        {
          proceeds: 50,
          cost_basis: 20,
          adjustments: -5,
        },
      ] as any),
    ).toBe(35);
    expect(
      inferCapitalTransactionTerm({
        term: "short",
        proceeds: 10,
        source_document_id: "doc",
      } as any),
    ).toBe("short");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_override",
          proceeds: 20,
          date_sold: "2025-04-01",
        } as any,
        {
          termOverrides: [
            {
              source_document_id: "doc_override",
              proceeds: 20,
              date_sold: "2025-04-01",
              term: "long",
            },
          ],
        },
      ),
    ).toBe("long");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_1099b_1",
          proceeds: 100,
          date_sold: "2025-02-01",
        } as any,
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe("long");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_1099b_1",
          proceeds: 999,
          date_sold: "2025-02-01",
        } as any,
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe("unknown");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_1099b_1",
          proceeds: 75,
          date_sold: "2025-02-01",
        } as any,
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe("unknown");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_1099b_1",
          proceeds: 50,
          date_sold: "2025-02-01",
          date_acquired: "2024-08-01",
        } as any,
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe("short");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_1099b_1",
          proceeds: 100,
          date_sold: "2025-02-01",
          date_acquired: "2023-01-02",
        } as any,
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe("long");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_override_date_acquired",
          proceeds: 20,
          date_sold: "2025-04-01",
          date_acquired: "2024-04-01",
        } as any,
        {
          termOverrides: [
            {
              source_document_id: "doc_override_date_acquired",
              proceeds: 20,
              date_sold: "2025-04-01",
              date_acquired: "2023-04-01",
              term: "long",
            },
          ],
        },
      ),
    ).toBe("short");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_override_source_document",
          proceeds: 20,
          date_sold: "2025-04-01",
        } as any,
        {
          termOverrides: [
            {
              source_document_id: "different_document",
              proceeds: 20,
              term: "long",
            },
          ],
        },
      ),
    ).toBe("unknown");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_override_proceeds",
          proceeds: 20,
          date_sold: "2025-04-01",
        } as any,
        {
          termOverrides: [
            {
              source_document_id: "doc_override_proceeds",
              proceeds: 21,
              term: "long",
            },
          ],
        },
      ),
    ).toBe("unknown");
    expect(
      inferCapitalTransactionTerm(
        {
          source_document_id: "doc_override_date_sold",
          proceeds: 20,
          date_sold: "2025-04-01",
          date_acquired: "2024-04-01",
        } as any,
        {
          termOverrides: [
            {
              source_document_id: "doc_override_date_sold",
              proceeds: 20,
              date_sold: "2025-04-02",
              term: "long",
            },
          ],
        },
      ),
    ).toBe("short");
    expect(
      inferCapitalTransactionTerm({
        source_document_id: "doc_invalid",
        proceeds: 50,
        date_acquired: "2025-02-02",
        date_sold: "2025-02-01",
      } as any),
    ).toBe("unknown");
    expect(
      inferCapitalTransactionTerm({
        source_document_id: "doc_missing_sold_date",
        proceeds: 50,
      } as any),
    ).toBe("unknown");
    expect(
      sumCapitalGainOrLossByTerm(
        [
          {
            source_document_id: "doc_1099b_1",
            proceeds: 100,
            gain_or_loss: 30,
            date_sold: "2025-02-01",
          },
          {
            source_document_id: "doc_1099b_1",
            proceeds: 50,
            gain_or_loss: -10,
            date_sold: "2025-02-01",
            date_acquired: "2024-08-01",
          },
          {
            source_document_id: "doc_unknown",
            proceeds: 25,
            gain_or_loss: 5,
          },
        ] as any,
        "long",
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe(30);
    expect(
      sumCapitalGainOrLossByTerm(
        [
          {
            source_document_id: "doc_1099b_1",
            proceeds: 100,
            gain_or_loss: 30,
            date_sold: "2025-02-01",
          },
          {
            source_document_id: "doc_1099b_1",
            proceeds: 50,
            gain_or_loss: -10,
            date_sold: "2025-02-01",
            date_acquired: "2024-08-01",
          },
          {
            source_document_id: "doc_unknown",
            proceeds: 25,
            gain_or_loss: 5,
          },
        ] as any,
        "short",
        {
          sourceDocuments: brokerSourceDocuments as any,
        },
      ),
    ).toBe(-5);
  });
});
