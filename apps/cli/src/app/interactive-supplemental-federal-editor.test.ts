import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CliRuntime } from "../core/runtime";
import {
  emptyCareExpenseEditorDraft,
  emptyCareProviderEditorDraft,
  emptyDependentEditorDraft,
  emptyElectionChoiceEditorDraft,
  emptyHsaCoverageMonthEditorDraft,
  empty1095AEditorDraft,
  empty1098EEditorDraft,
  empty1099GEditorDraft,
  empty1099NecEditorDraft,
  emptyMarketplaceMonthlyRowEditorDraft,
  emptyOtherIncomeItemEditorDraft,
  emptyScheduleCBusinessEditorDraft,
  parseInteractiveSupplementalFederalDraft,
  serializeInteractiveSupplementalFederalDraft,
} from "./interactive-supplemental-federal-editor";
import { createInteractiveSession, saveInteractiveDrafts } from "./interactive-workflow";

describe("interactive supplemental federal editor", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const directory of tempDirs) {
      await rm(directory, { force: true, recursive: true });
    }

    tempDirs.length = 0;
  });

  it("round-trips the default supplemental draft", async () => {
    const runtime = await createRuntime(tempDirs);
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "roundtrip"),
    });

    const structured = parseInteractiveSupplementalFederalDraft(
      session.supplementalFederalDraft,
    );
    const serialized = serializeInteractiveSupplementalFederalDraft({
      draft: structured,
      householdDraft: session.householdDraft,
      writtenAt: "2026-03-16T18:00:00.000Z",
    });

    expect(JSON.parse(serialized.householdJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.householdJson),
    );
    expect(JSON.parse(serialized.additionalDocumentsJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.additionalDocumentsJson),
    );
    expect(JSON.parse(serialized.supplementalIncomeJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.supplementalIncomeJson),
    );
    expect(JSON.parse(serialized.adjustmentsJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.adjustmentsJson),
    );
    expect(JSON.parse(serialized.itemizedDeductionsJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.itemizedDeductionsJson),
    );
    expect(JSON.parse(serialized.creditsJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.creditsJson),
    );
    expect(JSON.parse(serialized.healthCoverageJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.healthCoverageJson),
    );
    expect(JSON.parse(serialized.federalOverridesJson)).toEqual(
      JSON.parse(session.supplementalFederalDraft.federalOverridesJson),
    );
    expect(JSON.parse(serialized.electionsJson)).toEqual({
      ...JSON.parse(session.supplementalFederalDraft.electionsJson),
      deduction_strategy_preference: "auto",
    });
  });

  it("serializes guided supplemental federal editors into canonical facts and documents", async () => {
    const runtime = await createRuntime(tempDirs);
    const session = await createInteractiveSession({
      filingStatus: "single",
      runtime,
      sessionDir: join(runtime.cwd, "guided"),
    });

    const structured = parseInteractiveSupplementalFederalDraft(
      session.supplementalFederalDraft,
    );

    const updated = {
      ...structured,
      family: {
        ...structured.family,
        dependents: [
          {
            ...emptyDependentEditorDraft(),
            personId: "p_child_1",
            firstName: "Maya",
            lastName: "Rivera",
            fullLegalName: "Maya Rivera",
            dateOfBirth: "2020-02-14",
            relationshipToTaxpayer: "child",
            qualifyingForChildTaxCredit: true,
            qualifyingForEitc: true,
          },
        ],
      },
      documents: {
        ...structured.documents,
        unemploymentForms: [
          {
            ...empty1099GEditorDraft(),
            personId: "p_taxpayer",
            payerName: "Arizona DES",
            unemploymentCompensation: "5000",
            federalIncomeTaxWithheld: "400",
          },
        ],
        studentLoanForms: [
          {
            ...empty1098EEditorDraft(),
            lenderName: "Student Loan Servicer",
            studentLoanInterestReceivedByLender: "600",
          },
        ],
        marketplaceForms: [
          {
            ...empty1095AEditorDraft(),
            recipientPersonId: "p_taxpayer",
            marketplaceIdentifier: "HealthCare.gov",
            policyNumber: "POL-123",
            coveredPersonIds: "p_taxpayer, p_child_1",
            monthlyRows: [
              {
                ...emptyMarketplaceMonthlyRowEditorDraft("annual"),
                enrollmentPremium: "12000",
                secondLowestCostSilverPlanPremium: "10000",
                advancePaymentOfPremiumTaxCredit: "4000",
              },
            ],
          },
        ],
      },
      supplementalIncome: {
        ...structured.supplementalIncome,
        necForms: [
          {
            ...empty1099NecEditorDraft(),
            payerName: "Example Client",
            amount: "2500",
            federalIncomeTaxWithheld: "250",
            linkedBusinessId: "biz_1",
          },
        ],
        scheduleCBusinesses: [
          {
            ...emptyScheduleCBusinessEditorDraft(),
            businessId: "biz_1",
            businessName: "Rivera Consulting",
            grossReceiptsOrSales: "12000",
            totalExpenses: "3000",
          },
        ],
        otherIncomeItems: [
          {
            ...emptyOtherIncomeItemEditorDraft(),
            description: "Jury duty pay",
            amount: "150",
          },
        ],
      },
      credits: {
        ...structured.credits,
        qualifyingPersonIdsForCare: "p_child_1",
        careProviders: [
          {
            ...emptyCareProviderEditorDraft(),
            providerId: "care_1",
            name: "Bright Start Daycare",
            last4Tin: "4321",
            addressLine1: "100 Elm St",
            addressCity: "Phoenix",
            addressPostalCode: "85001",
          },
        ],
        careExpenses: [
          {
            ...emptyCareExpenseEditorDraft(),
            personId: "p_child_1",
            providerId: "care_1",
            amount: "1800",
            monthsOfCare: "6",
          },
        ],
        hsaCoverageMonths: [
          {
            ...emptyHsaCoverageMonthEditorDraft(),
            personId: "p_taxpayer",
            month: "january",
            coverageType: "self_only",
          },
        ],
      },
      overrides: {
        ...structured.overrides,
        federalOverrides: [{ key: "form_8962_force_recompute", valueText: "true" }],
        otherElections: [
          {
            ...emptyElectionChoiceEditorDraft(),
            electionCode: "deduction_override_note",
            description: "Attach internal review note",
            selectedValueText: "\"itemized review complete\"",
          },
        ],
      },
    };

    const serialized = serializeInteractiveSupplementalFederalDraft({
      draft: updated,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      writtenAt: "2026-03-16T18:00:00.000Z",
    });

    const saved = await saveInteractiveDrafts({
      session,
      householdDraft: {
        ...session.householdDraft,
        firstName: "Alex",
        lastName: "Rivera",
        fullLegalName: "Alex Rivera",
      },
      incomeDraft: session.incomeDraft,
      supplementalFederalDraft: serialized,
      paymentsDraft: session.paymentsDraft,
      efileDraft: session.efileDraft,
      writtenAt: "2026-03-16T18:00:00.000Z",
    });

    const persisted = await readFile(saved.canonicalPath, "utf8");

    expect(persisted).toContain('"document_type": "FORM_1099_G"');
    expect(persisted).toContain('"document_type": "FORM_1098_E"');
    expect(persisted).toContain('"document_type": "FORM_1095_A"');
    expect(persisted).toContain('"document_type": "FORM_1099_NEC"');
    expect(persisted).toContain('"unemployment_compensation": 5000');
    expect(persisted).toContain('"student_loan_interest_deduction": 600');
    expect(persisted).toContain('"marketplace_identifier": "HealthCare.gov"');
    expect(persisted).toContain('"linked_business_id": "biz_1"');
    expect(persisted).toContain('"description": "Jury duty pay"');
    expect(persisted).toContain('"name": "Bright Start Daycare"');
    expect(persisted).toContain('"coverage_type": "self_only"');
    expect(persisted).toContain('"form_8962_force_recompute": true');
    expect(persisted).toContain('"election_code": "deduction_override_note"');
  });
});

async function createRuntime(tempDirs: string[]): Promise<CliRuntime> {
  const cwd = await mkdtemp(join(tmpdir(), "taxzilla-tui-"));
  tempDirs.push(cwd);

  return {
    cwd,
    now: () => new Date("2026-03-16T12:00:00.000Z"),
    generateReturnId: () => "interactive_return",
  };
}
