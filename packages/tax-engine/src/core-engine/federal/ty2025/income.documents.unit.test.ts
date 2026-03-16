import { describe, expect, it } from "vitest";

import {
  buildSourceDocumentPayloadPointersById,
  findSourceDocumentPayloadById,
  getRetirementDistributionCodes,
  resolveMisc1099IncomeAmount,
  resolveNonemployeeCompensationAmount,
  resolveRetirementDistributionAmounts,
  resolveSocialSecurityBenefitAmounts,
  resolveUnemploymentCompensationAmount,
} from "./income-source-documents";

describe("core-engine income source-document helpers", () => {
  it("reads direct and source-document income amounts across supported forms", () => {
    const sourceDocuments = [
      {
        document_id: "doc_r",
        document_type: "FORM_1099_R",
        payload: {
          gross_distribution: 1000,
          taxable_amount: 400,
          distribution_code_1: "7",
          distribution_code_2: "G",
        },
      },
      {
        document_id: "doc_r_rollover",
        document_type: "FORM_1099_R",
        payload: {
          gross_distribution: 1000,
          distribution_code_1: "G",
        },
      },
      {
        document_id: "doc_g",
        document_type: "FORM_1099_G",
        payload: {
          unemployment_compensation: 250,
        },
      },
      {
        document_id: "doc_ssa",
        document_type: "FORM_SSA_1099",
        payload: {
          benefits_paid_in_2025: 1200,
          benefits_repaid_in_2025: 200,
        },
      },
      {
        document_id: "doc_nec",
        document_type: "FORM_1099_NEC",
        payload: {
          nonemployee_compensation: 600,
        },
      },
      {
        document_id: "doc_misc",
        document_type: "FORM_1099_MISC",
        payload: {
          rents: 700,
          crop_insurance_proceeds: 44,
          medical_and_health_care_payments: 33,
          substitute_payments_in_lieu_of_dividends_or_interest: 55,
        },
      },
    ];

    expect(findSourceDocumentPayloadById(sourceDocuments as any, "doc_misc", "FORM_1099_MISC")).toEqual(
      expect.objectContaining({
        rents: 700,
        substitute_payments_in_lieu_of_dividends_or_interest: 55,
      }),
    );
    expect(buildSourceDocumentPayloadPointersById(sourceDocuments as any, "doc_misc", ["rents", "missing"])).toEqual([
      "/source_documents/5/payload/rents",
    ]);
    expect(
      getRetirementDistributionCodes(
        {
          source_document_id: "doc_r",
          distribution_codes: ["7"],
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual(["7", "G"]);
    expect(
      resolveRetirementDistributionAmounts(
        {
          source_document_id: "doc_r",
          taxable_amount: 350,
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      assumedTaxableAmount: false,
      grossDistribution: 1000,
      taxableAmount: 350,
    });
    expect(
      resolveRetirementDistributionAmounts(
        {
          source_document_id: "doc_r_rollover",
          distribution_codes: ["G"],
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      assumedTaxableAmount: false,
      grossDistribution: 1000,
      taxableAmount: 0,
    });
    expect(
      resolveRetirementDistributionAmounts(
        {
          source_document_id: "doc_zero",
          gross_distribution: 0,
          distribution_codes: [],
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      assumedTaxableAmount: false,
      grossDistribution: 0,
      taxableAmount: 0,
    });
    expect(
      resolveRetirementDistributionAmounts(
        {
          source_document_id: "doc_missing",
          gross_distribution: 800,
          distribution_codes: [],
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      assumedTaxableAmount: true,
      grossDistribution: 800,
      taxableAmount: 800,
    });
    expect(
      resolveRetirementDistributionAmounts(
        {
          source_document_id: "doc_missing_gross",
          taxable_amount: 50,
          distribution_codes: [],
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      assumedTaxableAmount: false,
      grossDistribution: 0,
      taxableAmount: 50,
    });
    expect(
      resolveUnemploymentCompensationAmount({ source_document_id: "doc_g" } as any, sourceDocuments as any),
    ).toBe(250);
    expect(
      resolveUnemploymentCompensationAmount(
        {
          source_document_id: "doc_g",
          unemployment_compensation: 125,
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(125);
    expect(
      resolveUnemploymentCompensationAmount({ source_document_id: "missing" } as any, sourceDocuments as any),
    ).toBe(0);
    expect(
      resolveSocialSecurityBenefitAmounts(
        {
          source_document_id: "doc_ssa",
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      benefitsPaid: 1200,
      benefitsRepaid: 200,
      netBenefits: 1000,
    });
    expect(
      resolveSocialSecurityBenefitAmounts(
        {
          source_document_id: "doc_ssa",
          benefits_paid: 1500,
          benefits_repaid: 100,
        } as any,
        sourceDocuments as any,
      ),
    ).toEqual({
      benefitsPaid: 1500,
      benefitsRepaid: 100,
      netBenefits: 1400,
    });
    expect(
      resolveSocialSecurityBenefitAmounts({ source_document_id: "missing" } as any, sourceDocuments as any),
    ).toEqual({
      benefitsPaid: 0,
      benefitsRepaid: 0,
      netBenefits: 0,
    });
    expect(
      resolveSocialSecurityBenefitAmounts(
        {
          source_document_id: "doc_ssa",
          net_benefits: 900,
        } as any,
        sourceDocuments as any,
      ).netBenefits,
    ).toBe(900);
    expect(
      resolveNonemployeeCompensationAmount({ source_document_id: "doc_nec" } as any, sourceDocuments as any),
    ).toBe(600);
    expect(
      resolveNonemployeeCompensationAmount(
        {
          source_document_id: "doc_nec",
          amount: 275,
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(275);
    expect(
      resolveNonemployeeCompensationAmount({ source_document_id: "missing" } as any, sourceDocuments as any),
    ).toBe(0);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "rents",
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(700);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "substitute_payments",
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(55);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "crop_insurance",
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(44);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "medical_payments",
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(33);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "patronage_dividends",
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(0);
    expect(
      resolveMisc1099IncomeAmount(
        {
          source_document_id: "doc_misc",
          income_category: "other_income",
          amount: 88,
        } as any,
        sourceDocuments as any,
      ),
    ).toBe(88);
  });
});
