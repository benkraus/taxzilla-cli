import { describe, expect, it } from "vitest";

import {
  buildMisc1099IncomeRollup,
  buildNonemployeeCompensationRollup,
  getScheduleEActivityTypeCandidatesForMisc1099Category,
} from "./income-rollups";

describe("core-engine income rollups", () => {
  it("rolls nonemployee compensation through explicit links, inferred businesses, and line 8j fallbacks", () => {
    const input = {
      source_documents: [
        {
          document_id: "doc_nec_1",
          document_type: "FORM_1099_NEC",
          payload: {
            nonemployee_compensation: 500,
          },
        },
        {
          document_id: "doc_nec_2",
          document_type: "FORM_1099_NEC",
          payload: {
            nonemployee_compensation: 300,
          },
        },
        {
          document_id: "doc_nec_3",
          document_type: "FORM_1099_NEC",
          payload: {
            nonemployee_compensation: 200,
          },
        },
        {
          document_id: "doc_nec_4",
          document_type: "FORM_1099_NEC",
          payload: {
            nonemployee_compensation: 150,
          },
        },
        {
          document_id: "doc_nec_5",
          document_type: "FORM_1099_NEC",
          payload: {
            nonemployee_compensation: 0,
          },
        },
      ],
      facts: {
        income: {
          schedule_c_businesses: [
            { business_id: "biz_1", owner_person_id: "p1" },
            { business_id: "biz_2", owner_person_id: "p2" },
            { business_id: "biz_3", owner_person_id: "p2" },
            { owner_person_id: "p5" },
          ],
          nonemployee_compensation: [
            { source_document_id: "doc_nec_1", person_id: "p1" },
            { source_document_id: "doc_nec_2", person_id: "p2", linked_business_id: "biz_2" },
            { source_document_id: "doc_nec_3", person_id: "p2", linked_business_id: "missing" },
            { source_document_id: "doc_nec_4", person_id: "p4" },
            { source_document_id: "doc_nec_5", person_id: "p1" },
          ],
        },
      },
    };

    expect(buildNonemployeeCompensationRollup(input as any)).toMatchObject({
      autoLinkedCount: 1,
      invalidLinkedBusinessCount: 1,
      line8jAmountTotal: 350,
      line8jCount: 2,
      linkedToScheduleCAmountTotal: 800,
    });
    expect(buildNonemployeeCompensationRollup(input as any).receiptsByBusinessId).toEqual(
      new Map([
        ["biz_1", 500],
        ["biz_2", 300],
      ]),
    );
  });

  it("routes misc 1099 categories through overrides, schedule E, and unsupported buckets", () => {
    const input = {
      source_documents: [],
      facts: {
        state_specific_fact_bag: {
          federal: {
            misc_1099: {
              overrides: [
                {
                  source_document_id: "doc_ignore",
                  treatment: "ignore_non_taxable",
                },
                {
                  source_document_id: "doc_line8z",
                  treatment: "schedule1_line8z",
                },
                {
                  source_document_id: "doc_override_schedule_e",
                  treatment: "schedule_e_activity",
                  activity_id: "activity_1",
                },
                {
                  source_document_id: "doc_override_name",
                  treatment: "schedule_e_activity",
                  activity_entity_name: "Royalty One",
                },
              ],
            },
          },
        },
        income: {
          schedule_e_activities: [
            {
              activity_id: "activity_1",
              activity_type: "rental_real_estate",
              entity_name: "Rental One",
              owner_person_id: "p1",
            },
            {
              activity_id: "activity_2",
              activity_type: "royalty",
              entity_name: "Royalty One",
              owner_person_id: "p2",
            },
          ],
          miscellaneous_1099_income: [
            { source_document_id: "doc_ignore", person_id: "p1", income_category: "rents", amount: 100 },
            { source_document_id: "doc_line8z", person_id: "p1", income_category: "rents", amount: 110 },
            {
              source_document_id: "doc_override_schedule_e",
              person_id: "p1",
              income_category: "rents",
              amount: 120,
            },
            { source_document_id: "doc_wagering", person_id: "p1", income_category: "wagering", amount: 130 },
            {
              source_document_id: "doc_substitute",
              person_id: "p1",
              income_category: "substitute_payments",
              amount: 140,
            },
            { source_document_id: "doc_review", person_id: "p9", income_category: "rents", amount: 150 },
            { source_document_id: "doc_unsupported", person_id: "p1", income_category: "medical_payments", amount: 160 },
            { source_document_id: "doc_auto_link", person_id: "p2", income_category: "royalties", amount: 170 },
            { source_document_id: "doc_override_name", person_id: "p2", income_category: "royalties", amount: 180 },
          ],
        },
      },
    };

    expect(getScheduleEActivityTypeCandidatesForMisc1099Category("rents")).toEqual([
      "rental_real_estate",
      "farm_rental",
    ]);
    expect(getScheduleEActivityTypeCandidatesForMisc1099Category("royalties")).toEqual(["royalty"]);
    expect(getScheduleEActivityTypeCandidatesForMisc1099Category("medical_payments")).toEqual([]);

    expect(buildMisc1099IncomeRollup(input as any)).toMatchObject({
      line8bGamblingAmountTotal: 130,
      line8zOtherIncomeAmountTotal: 250,
      scheduleEAutoLinkedCount: 1,
      scheduleEMappedCount: 3,
      scheduleEMappedIncomeAmountTotal: 470,
      scheduleEReviewCount: 1,
      scheduleEReviewIncomeAmountTotal: 150,
      unsupportedCount: 1,
      unsupportedIncomeAmountTotal: 160,
      scheduleEReviewCategories: ["rents"],
      unsupportedCategories: ["medical_payments"],
    });
    expect(buildMisc1099IncomeRollup(input as any).scheduleEIncomeByActivityIndex).toEqual(
      new Map([
        [0, 120],
        [1, 350],
      ]),
    );
    expect(buildMisc1099IncomeRollup(input as any).scheduleEMiscIndicesByActivityIndex).toEqual(
      new Map([
        [0, [2]],
        [1, [7, 8]],
      ]),
    );
  });
});
