we have this

Yes, hospital bills in the Philippines are valid for a senior citizen discount, and you can use both the senior citizen privileges and PhilHealth together. [1, 2, 3]
How the Calculation Works
Under PhilHealth Advisory 2023-0036 and Republic Act No. 9994 (Expanded Senior Citizens Act), accredited hospitals must apply deductions in a specific order prior to discharge: [1, 2]

1. 12% VAT Exemption is deducted first from applicable hospital goods and services. [1]
2. 20% Senior Citizen Discount is applied next to the remaining amount. [1]
3. PhilHealth Benefits (such as case rates or specific benefit packages) are deducted last from the remaining balance. [1]
   Key Rules to Keep in Mind

- Not an "Either/Or" Choice: You do not have to choose between PhilHealth and the senior discount; the law mandates that both should be applied sequentially to lower the remaining balance (yun pong balanse ang siya na lamang dapat bayaran ng pasyente). [1, 2]
- Public vs. Private Hospitals:
  - In accredited private hospitals, you get the 12% VAT exemption, the 20% senior discount on room/medicines/professional fees, and whatever PhilHealth benefit applies to the illness case rate.
  - In accredited public hospitals, senior citizens can avail of the No Balance Billing (NBB) policy or government programs like the Malasakit Center, which can reduce or completely cover remaining hospital expenses. [1, 2, 3, 4, 5, 6]
- What to Present: Bring a valid government-issued ID showing age 60 or above (such as your OSCA Senior Citizen ID, passport, or other valid ID) and your PhilHealth ID or Member Data Record (MDR) to the hospital's billing or admissions office before final discharge. [1, 2, 3, 4]
- Where to Report Violations: If a private or accredited hospital refuses to grant the proper senior citizen discount on top of PhilHealth, you can report them to the Office for Senior Citizens Affairs (OSCA) in your local government unit or contact PhilHealth directly via their callback channel at 0917-898-7442. [1, 2]
  Are you asking about a specific hospital (private or public) or a particular type of medical procedure or room charge? I can help you understand what items on the bill are covered.

Yes—that text accurately reflects **PhilHealth Advisory No. 2023-0036** and **Republic Act No. 9994** (and mirrors **RA 10754** for Persons with Disabilities).

For **BillLens PH**, this is one of the highest-impact rules to bake into your deterministic audit engine, because private hospitals frequently reverse the order—deducting PhilHealth _first_ before computing the 20% Senior/PWD discount, which unlawfully shrinks the patient's discount and inflates their out-of-pocket balance.

### Why This Order Matters Mathematically (Audit Logic)

Suppose a Senior Citizen incurs **₱112,000** in VAT-inclusive hospital charges and qualifies for a **₱20,000** PhilHealth Case Rate:

| Calculation Step                  | Legally Mandated Order (RA 9994 / Adv. 2023-0036)              | Common Hospital Billing Error (PhilHealth First)                |
| --------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| **1. Gross Bill (VAT-Inclusive)** | ₱112,000.00                                                    | ₱112,000.00                                                     |
| **2. Less 12% VAT ($\div 1.12$)** | ₱100,000.00 _(saves ₱12,000)_                                  | ₱100,000.00 _(saves ₱12,000)_                                   |
| **3. Next Deduction**             | **-20% Senior Discount:** -₱20,000.00 $\rightarrow$ ₱80,000.00 | **-PhilHealth Case Rate:** -₱20,000.00 $\rightarrow$ ₱80,000.00 |
| **4. Final Deduction**            | **-PhilHealth Case Rate:** -₱20,000.00                         | **-20% Senior Discount:** -₱16,000.00                           |
| **Final Net Payable**             | **₱60,000.00**                                                 | **₱64,000.00** _(₱4,000 overcharge)_                            |

---

### How to Encode This into BillLens PH's Audit Engine

1. **Patient Profile & Discount Flag:**

- In the Scan Hub upload flow, include toggles for **Senior Citizen (60+)** and **PWD** (mutually exclusive—a patient who is both can only claim one, per RA 9994 IRR).

2. **Line-Item VAT & Exemption Granularity:**

- Not every line item carries 12% VAT in a hospital (e.g., VAT-exempt medicines under TRAIN/CREATE laws vs. VAT-able room charges, supplies, and equipment). Your parser should check whether line items already exclude VAT or require dividing by `1.12` before applying the `0.80` multiplier.
- Apply the 20% discount separately to both **Health Care Institution (HCI) charges** and **Doctors' Professional Fees (PF)** before subtracting the respective HCI and PF shares of the PhilHealth Case Rate.

3. **Anomaly Flagging Rule (`WRONG_DEDUCTION_SEQUENCE`):**

- If the parsed Statement of Account shows `PhilHealth Benefit` subtracted _above_ or _prior to_ the `Senior Citizen / PWD Discount` line item—or if the computed SC/PWD discount equals $20\% \times (\text{Net VAT-Exempt Bill} - \text{PhilHealth})$ instead of $20\% \times \text{Net VAT-Exempt Bill}$—flag a **High-Severity Statutory Compliance Violation** and display the exact peso difference owed back to the patient.

4. **Copilot Dispute Script & Escalation:**

- When `WRONG_DEDUCTION_SEQUENCE` triggers, have the AI Subsidy Copilot cite **PhilHealth Advisory 2023-0036** and **PhilHealth Circular 0056-2012**, generate a polite billing-counter recomputation summary, and surface the PhilHealth callback hotline (`0917-898-7442`) and local LGU **OSCA / PDAO** escalation path if the billing clerk refuses to adjust the SOA before discharge.
