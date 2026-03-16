import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CliRuntime } from "../core/runtime";
import {
  addBlankEstimatedPayment,
  addBlankInterestDraft,
  addBlankRetirementDraft,
  addBlankW2Draft,
  applyHouseholdDraft,
  applyIncomeDraft,
  createInteractiveSession,
  emptyEfileDraft,
  emptyPaymentsDraft,
  exportInteractiveSession,
  householdDraftFromCanonical,
  incomeDraftFromCanonical,
  openInteractiveSession,
  saveInteractiveDrafts,
  saveIncomeDraft,
  saveHouseholdDraft,
} from "./interactive-workflow";

describe("interactive workflow", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const directory of tempDirs) {
      await rm(directory, { force: true, recursive: true });
    }

    tempDirs.length = 0;
  });

  it("creates and reopens a session directory", async () => {
    const runtime = await createRuntime();
    const sessionDir = join(runtime.cwd, "tui-session");

    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir,
    });
    const reopened = await openInteractiveSession(sessionDir);

    expect(session.sessionDir).toBe(sessionDir);
    expect(reopened.canonicalPath).toBe(join(sessionDir, "canonical-return.json"));
    expect(reopened.householdDraft.filingStatus).toBe("single");
  });

  it("creates and reopens a session directory with requested states", async () => {
    const runtime = await createRuntime();
    const sessionDir = join(runtime.cwd, "tui-state-session");

    const session = await createInteractiveSession({
      filingStatus: "single",
      requestedStateCodes: ["CA", "NY"],
      runtime,
      sessionDir,
    });
    const reopened = await openInteractiveSession(sessionDir);

    expect(session.canonicalReturn.requested_jurisdictions.states).toEqual(["CA", "NY"]);
    expect(Object.keys(session.canonicalReturn.state_returns)).toEqual(["CA", "NY"]);
    expect(reopened.canonicalReturn.requested_jurisdictions.states).toEqual(["CA", "NY"]);
    expect(Object.keys(reopened.canonicalReturn.state_returns)).toEqual(["CA", "NY"]);
  });

  it("applies and saves household edits", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "editable"),
    });

    const updated = await saveHouseholdDraft({
      session,
      householdDraft: {
        filingStatus: "head_of_household",
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
        email: "alex@example.com",
        phone: "555-1212",
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const persisted = JSON.parse(await readFile(updated.canonicalPath, "utf8")) as Record<
      string,
      unknown
    >;

    expect(updated.householdDraft.filingStatus).toBe("head_of_household");
    expect(JSON.stringify(persisted)).toContain('"full_legal_name":"Alex Rivera"');
    expect(JSON.stringify(persisted)).toContain('"updated_at":"2026-03-16T18:00:00.000Z"');
  });

  it("exports session artifacts and a manifest", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "exportable"),
    });
    const saved = await saveHouseholdDraft({
      session,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });

    const exported = await exportInteractiveSession({
      session: saved,
      presetId: "return_ir",
      runtime,
    });

    expect(exported.artifacts).toHaveLength(1);
    expect(exported.artifacts[0]?.fileName).toBe("return-ir.json");
    expect(await readFile(exported.manifestPath, "utf8")).toContain('"command": "export"');
  });

  it("applies and saves W-2 and 1099-INT edits", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "income"),
    });

    const saved = await saveInteractiveDrafts({
      session,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      incomeDraft: {
        w2s: [
          {
            documentId: "doc_w2_acme_manual",
            wageId: "wage_acme_manual",
            employerName: "Acme Inc.",
            employerEin: "12-3456789",
            wages: "85000",
            federalWithholding: "9000",
            socialSecurityWages: "85000",
            socialSecurityTaxWithheld: "5270",
            medicareWages: "85000",
            medicareTaxWithheld: "1232.5",
          },
        ],
        interests: [
          {
            documentId: "doc_1099int_bank_manual",
            interestId: "int_bank_manual",
            payerName: "Example Bank",
            payerTin: "98-7654321",
            interestIncome: "45.32",
            federalWithholding: "5",
            taxExemptInterest: "0",
            usSavingsBondsAndTreasuryInterest: "0",
            foreignTaxPaid: "0",
          },
        ],
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const persisted = await readFile(saved.canonicalPath, "utf8");

    expect(saved.incomeDraft.w2s).toHaveLength(1);
    expect(saved.incomeDraft.interests).toHaveLength(1);
    expect(persisted).toContain('"document_type": "FORM_W2"');
    expect(persisted).toContain('"document_type": "FORM_1099_INT"');
    expect(persisted).toContain('"Federal withholding from W-2"');
    expect(persisted).toContain('"Federal withholding from 1099-INT"');
    expect(persisted).toContain('"wages_tips_other_compensation": 85000');
    expect(persisted).toContain('"interest_income": 45.32');
  });

  it("derives a household draft from canonical data", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "draft"),
    });
    const updatedCanonical = applyHouseholdDraft(session.canonicalReturn, {
      householdDraft: {
        filingStatus: "married_filing_jointly",
        firstName: "Sam",
        lastName: "Taylor",
        fullLegalName: "Sam Taylor",
        email: "sam@example.com",
        phone: "555-3434",
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const draft = householdDraftFromCanonical(updatedCanonical);

    expect(draft.filingStatus).toBe("married_filing_jointly");
    expect(draft.email).toBe("sam@example.com");
  });

  it("derives income drafts and supports add or remove helpers", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "income-draft"),
    });
    const canonicalReturn = applyIncomeDraft(session.canonicalReturn, {
      incomeDraft: {
        w2s: [
          {
            documentId: "doc_w2_manual",
            wageId: "wage_manual",
            employerName: "Acme Inc.",
            employerEin: "12-3456789",
            wages: "85000",
            federalWithholding: "9000",
            socialSecurityWages: "",
            socialSecurityTaxWithheld: "",
            medicareWages: "",
            medicareTaxWithheld: "",
          },
        ],
        interests: [],
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const draft = incomeDraftFromCanonical(canonicalReturn);
    const withBlanks = addBlankInterestDraft(addBlankW2Draft(draft));

    expect(draft.w2s[0]?.employerName).toBe("Acme Inc.");
    expect(draft.w2s[0]?.socialSecurityWages).toBe("85000");
    expect(withBlanks.w2s).toHaveLength(2);
    expect(withBlanks.interests).toHaveLength(1);
    expect(withBlanks.w2s[1]?.documentId).toBe("doc_w2_2");
    expect(withBlanks.interests[0]?.documentId).toBe("doc_1099int_1");
  });

  it("assigns stable ids to blank payment and retirement drafts", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "payment-draft"),
    });

    const withRetirement = addBlankRetirementDraft(session.incomeDraft);
    const withPayments = addBlankEstimatedPayment(
      addBlankEstimatedPayment(emptyPaymentsDraft()),
    );

    expect(withRetirement.retirements?.[0]?.documentId).toBe("doc_1099r_1");
    expect(withPayments.estimatedPayments[0]?.paymentId).toBe("est_1");
    expect(withPayments.estimatedPayments[1]?.paymentId).toBe("est_2");
  });

  it("persists dividend, retirement, payment, banking, and e-file edits", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "phase-four"),
    });

    const saved = await saveInteractiveDrafts({
      session,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      incomeDraft: {
        ...session.incomeDraft,
        dividends: [
          {
            documentId: "doc_1099div_brokerage_manual",
            dividendId: "div_brokerage_manual",
            payerName: "Example Brokerage",
            payerTin: "11-2233445",
            recipientAccountNumber: "****5678",
            ordinaryDividends: "210.55",
            qualifiedDividends: "180.25",
            capitalGainDistributions: "30.3",
            federalWithholding: "12",
            exemptInterestDividends: "0",
            foreignTaxPaid: "4.5",
          },
        ],
        retirements: [
          {
            documentId: "doc_1099r_plan_manual",
            distributionId: "ret_plan_manual",
            payerName: "Example Retirement Plan",
            payerTin: "22-3344556",
            recipientAccountNumber: "****1122",
            grossDistribution: "1000",
            taxableAmount: "850",
            federalWithholding: "95",
            distributionCode1: "7",
            distributionCode2: "IRA",
            taxableAmountNotDetermined: false,
            totalDistribution: true,
            iraSepSimple: true,
          },
        ],
        w2s: session.incomeDraft.w2s,
        interests: session.incomeDraft.interests,
      },
      paymentsDraft: {
        ...emptyPaymentsDraft(),
        estimatedPayments: [
          {
            paymentId: "est_manual_q1",
            amount: "500",
            paidDate: "2026-04-15",
            quarter: "Q1",
          },
        ],
        extensionPayments: [
          {
            extensionPaymentId: "ext_manual_4868",
            amount: "250",
            paidDate: "2026-04-14",
            formType: "4868",
          },
        ],
        priorYearOverpaymentAppliedTo2025: "100",
        refundDirectDepositEnabled: true,
        refundBankName: "Example Bank",
        refundAccountType: "checking",
        refundLast4AccountNumber: "6789",
        refundLast4RoutingNumber: "4321",
        refundVaultToken: "vault:bank:refund",
        balanceDueDirectDebitEnabled: true,
        debitBankName: "Another Bank",
        debitAccountType: "savings",
        debitLast4AccountNumber: "1111",
        debitLast4RoutingNumber: "2222",
        debitVaultToken: "vault:bank:debit",
        debitRequestedDate: "2026-04-15",
      },
      efileDraft: {
        ...emptyEfileDraft(),
        signatureMethod: "self_select_pin",
        taxpayerPinToken: "vault:pin:taxpayer",
        taxpayerPriorYearAgi: "80000",
        taxpayerPriorYearPinToken: "vault:pin:prior",
        taxpayerSignedAt: "2026-03-16T18:00:00.000Z",
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const persisted = await readFile(saved.canonicalPath, "utf8");

    expect(saved.incomeDraft.dividends).toHaveLength(1);
    expect(saved.incomeDraft.retirements).toHaveLength(1);
    expect(saved.paymentsDraft.estimatedPayments).toHaveLength(1);
    expect(saved.paymentsDraft.extensionPayments).toHaveLength(1);
    expect(saved.efileDraft.signatureMethod).toBe("self_select_pin");
    expect(persisted).toContain('"document_type": "FORM_1099_DIV"');
    expect(persisted).toContain('"document_type": "FORM_1099_R"');
    expect(persisted).toContain('"Federal withholding from 1099-DIV"');
    expect(persisted).toContain('"Federal withholding from 1099-R"');
    expect(persisted).toContain('"payment_id": "est_manual_q1"');
    expect(persisted).toContain('"extension_payment_id": "ext_manual_4868"');
    expect(persisted).toContain('"refund_direct_deposit"');
    expect(persisted).toContain('"balance_due_direct_debit"');
    expect(persisted).toContain('"signature_method": "self_select_pin"');
    expect(persisted).toContain('"person_id": "p_taxpayer"');
  });

  it("persists the supplemental federal coverage sections", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "supplemental-federal"),
    });
    const defaultAdjustments = JSON.parse(
      session.supplementalFederalDraft.adjustmentsJson,
    ) as Record<string, unknown>;
    const defaultItemizedDeductions = JSON.parse(
      session.supplementalFederalDraft.itemizedDeductionsJson,
    ) as Record<string, unknown>;
    const defaultCredits = JSON.parse(
      session.supplementalFederalDraft.creditsJson,
    ) as Record<string, unknown>;
    const defaultHealthCoverage = JSON.parse(
      session.supplementalFederalDraft.healthCoverageJson,
    ) as Record<string, unknown>;
    const defaultElections = JSON.parse(
      session.supplementalFederalDraft.electionsJson,
    ) as Record<string, unknown>;

    const saved = await saveInteractiveDrafts({
      session,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      incomeDraft: session.incomeDraft,
      supplementalFederalDraft: {
        householdJson: JSON.stringify(
          {
            taxpayer: {
              date_of_birth: "1990-05-14",
              last4_tax_id: "1234",
              is_blind: false,
              is_full_time_student: false,
              occupation: "Engineer",
            },
            spouse: null,
            dependents: [
              {
                person_id: "p_child_1",
                role: "dependent",
                name: {
                  first: "Maya",
                  last: "Rivera",
                  full_legal_name: "Maya Rivera",
                },
                date_of_birth: "2020-02-14",
                relationship_to_taxpayer: "child",
                months_lived_with_taxpayer: 12,
                qualifying_for_child_tax_credit: true,
                qualifying_for_credit_for_other_dependents: false,
                qualifying_for_eitc: true,
                is_disabled: false,
                is_full_time_student: false,
              },
            ],
            can_be_claimed_as_dependent: false,
          },
          null,
          2,
        ),
        additionalDocumentsJson: JSON.stringify([], null, 2),
        supplementalIncomeJson: JSON.stringify(
          {
            capital_transactions: [
              {
                source_document_id: "doc_1099b_manual",
                date_acquired: "2024-01-05",
                date_sold: "2025-02-01",
                proceeds: 1200,
                cost_basis: 1000,
                adjustments: 0,
                gain_or_loss: 200,
                term: "long",
              },
            ],
            unemployment_compensation: [
              {
                source_document_id: "doc_1099g_manual",
                unemployment_compensation: 5000,
                federal_income_tax_withheld: 400,
              },
            ],
            social_security_benefits: [
              {
                source_document_id: "doc_ssa1099_manual",
                benefits_paid: 12000,
                benefits_repaid: 0,
                net_benefits: 12000,
              },
            ],
            nonemployee_compensation: [
              {
                person_id: "p_taxpayer",
                source_document_id: "doc_1099nec_manual",
                amount: 1500,
                federal_income_tax_withheld: 150,
                linked_business_id: "biz_1",
              },
            ],
            miscellaneous_1099_income: [
              {
                person_id: "p_taxpayer",
                source_document_id: "doc_1099misc_manual",
                income_category: "other_income",
                amount: 300,
                federal_income_tax_withheld: 0,
              },
            ],
            schedule_c_businesses: [
              {
                business_id: "biz_1",
                owner_person_id: "p_taxpayer",
                gross_receipts_or_sales: 4500,
                returns_and_allowances: 0,
                cost_of_goods_sold: 0,
                other_business_income: 0,
                expenses: [
                  {
                    amount: 500,
                  },
                ],
                home_office_deduction: 100,
              },
            ],
            schedule_e_activities: [
              {
                activity_id: "rent_1",
                owner_person_id: "p_taxpayer",
                activity_type: "rental_real_estate",
                entity_name: "Maple Duplex",
                materially_participates: false,
                income_items: [
                  {
                    description: "Rents",
                    amount: 18000,
                  },
                ],
                expense_items: [
                  {
                    description: "Repairs",
                    amount: 4000,
                  },
                ],
                source_document_ids: ["doc_1099misc_manual"],
              },
            ],
            other_income_items: [
              {
                description: "Jury duty",
                amount: 50,
              },
            ],
          },
          null,
          2,
        ),
        supplementalWithholdingsJson: JSON.stringify(
          [
            {
              withholding_id: "wh_1099g_manual",
              person_id: "p_taxpayer",
              jurisdiction: "federal",
              state_code: null,
              locality_name: "",
              source_document_id: "doc_1099g_manual",
              amount: 400,
              description: "Federal withholding from 1099-G",
            },
          ],
          null,
          2,
        ),
        adjustmentsJson: JSON.stringify(
          {
            ...defaultAdjustments,
            educator_expenses: 250,
            health_savings_account_deduction: 100,
            student_loan_interest_deduction: 300,
            other_adjustments: [
              {
                description: "Other adjustment",
                amount: 75,
              },
            ],
          },
          null,
          2,
        ),
        itemizedDeductionsJson: JSON.stringify(
          {
            ...defaultItemizedDeductions,
            medical_and_dental_expenses: 800,
            mortgage_interest_items: [
              {
                source_document_id: "doc_1098_manual",
                mortgage_interest_received: 2500,
                points_paid: 100,
                mortgage_insurance_premiums: 0,
                real_estate_taxes_paid: 900,
              },
            ],
            charitable_cash_contributions: 400,
          },
          null,
          2,
        ),
        creditsJson: JSON.stringify(
          {
            ...defaultCredits,
            candidate_child_tax_credit_dependent_ids: ["p_child_1"],
            candidate_credit_for_other_dependent_ids: [],
            candidate_eitc_child_ids: ["p_child_1"],
            child_and_dependent_care: {
              qualifying_person_ids: ["p_child_1"],
              providers: [
                {
                  provider_id: "prov_1",
                  name: "Neighborhood Daycare",
                },
              ],
              expenses: [
                {
                  person_id: "p_child_1",
                  provider_id: "prov_1",
                  amount: 2400,
                  months_of_care: 6,
                },
              ],
            },
            education_credits: {
              students: [
                {
                  student_person_id: "p_taxpayer",
                  source_document_ids: ["doc_1098t_manual"],
                  qualified_expenses_paid: 2000,
                  tax_free_assistance: 500,
                  is_aotc_candidate: true,
                  is_llc_candidate: false,
                },
              ],
            },
            premium_tax_credit: {
              policies: [
                {
                  policy_id: "ptc_1",
                  source_document_id: "doc_1095a_manual",
                  marketplace_identifier: "Covered CA",
                  covered_person_ids: ["p_taxpayer"],
                  monthly_rows: [
                    {
                      month: "annual",
                      advance_payment_of_premium_tax_credit: 300,
                      enrollment_premium: 500,
                      second_lowest_cost_silver_plan_premium: 450,
                    },
                  ],
                },
              ],
            },
            other_nonrefundable_credits: [
              {
                description: "Foreign tax credit carryover",
                amount: 400,
              },
            ],
            other_refundable_credits: [
              {
                description: "Recovery rebate correction",
                amount: 150,
              },
            ],
          },
          null,
          2,
        ),
        healthCoverageJson: JSON.stringify(
          {
            ...defaultHealthCoverage,
            marketplace_policies: [
              {
                policy_id: "mkt_1",
                source_document_id: "doc_1095a_manual",
                marketplace_identifier: "Covered CA",
                covered_person_ids: ["p_taxpayer"],
                monthly_rows: [
                  {
                    month: "annual",
                    advance_payment_of_premium_tax_credit: 300,
                    enrollment_premium: 500,
                    second_lowest_cost_silver_plan_premium: 450,
                  },
                ],
              },
            ],
            hsa_coverage_months: [
              {
                person_id: "p_taxpayer",
                month: "january",
                coverage_type: "self_only",
              },
            ],
          },
          null,
          2,
        ),
        federalOverridesJson: JSON.stringify(
          {
            form2441: {
              allow_married_filing_separately_lived_apart_exception: true,
            },
            schedule_d: {
              prior_year_short_term_capital_loss_carryforward: 100,
              prior_year_long_term_capital_loss_carryforward: 200,
            },
            schedule_e: {
              allow_reported_net_losses_without_limitation_overrides: true,
              limitation_overrides: [
                {
                  activity_id: "rent_1",
                  allowed_net_after_limitations: -25,
                },
              ],
            },
          },
          null,
          2,
        ),
        electionsJson: JSON.stringify(
          {
            ...defaultElections,
            capital_loss_carryforward_imported: true,
          },
          null,
          2,
        ),
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });
    const persisted = await readFile(saved.canonicalPath, "utf8");

    expect(persisted).toContain('"date_of_birth": "1990-05-14"');
    expect(persisted).toContain('"person_id": "p_child_1"');
    expect(persisted).toContain('"schedule_c_businesses"');
    expect(persisted).toContain('"Maple Duplex"');
    expect(persisted).toContain('"Federal withholding from 1099-G"');
    expect(persisted).toContain('"mortgage_interest_items"');
    expect(persisted).toContain('"Neighborhood Daycare"');
    expect(persisted).toContain('"marketplace_policies"');
    expect(persisted).toContain('"capital_loss_carryforward_imported": true');
  });

  it("rejects structured forms inside the supplemental source document editor", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "supplemental-doc-validation"),
    });

    await expect(
      saveInteractiveDrafts({
        session,
        householdDraft: session.householdDraft,
        incomeDraft: session.incomeDraft,
        supplementalFederalDraft: {
          ...session.supplementalFederalDraft,
          additionalDocumentsJson: JSON.stringify(
            [
              {
                document_type: "FORM_W2",
              },
            ],
            null,
            2,
          ),
        },
        writtenAt: "2026-03-16T18:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      _tag: "CliInteractiveValidationError",
    });
  });

  it("rejects invalid W-2 issuer details", async () => {
    const runtime = await createRuntime();
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "invalid-income"),
    });

    await expect(
      saveIncomeDraft({
        session,
        incomeDraft: {
          w2s: [
            {
              documentId: "doc_w2_invalid",
              wageId: "wage_invalid",
              employerName: "",
              employerEin: "BAD-EIN",
              wages: "100",
              federalWithholding: "",
              socialSecurityWages: "",
              socialSecurityTaxWithheld: "",
              medicareWages: "",
              medicareTaxWithheld: "",
            },
          ],
          interests: [],
        },
        writtenAt: "2026-03-16T18:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      _tag: "CliInteractiveValidationError",
    });
  });

  async function createRuntime(): Promise<CliRuntime> {
    const cwd = await mkdtemp(join(tmpdir(), "taxzilla-tui-"));
    tempDirs.push(cwd);

    return {
      cwd,
      now: () => new Date("2026-03-16T12:00:00.000Z"),
      generateReturnId: () => "interactive_return",
    };
  }
});
