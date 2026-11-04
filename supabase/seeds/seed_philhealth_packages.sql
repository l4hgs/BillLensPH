-- ==============================================================================
-- BillLens PH: PhilHealth All-Case-Rates (ACR) & Benefit Packages Seed Data
-- Aligned with PhilHealth Circulars 2024-0001, 2024-0037 (50% Upward Adjustment),
-- and 2026 Maternal/Surgical Rationalization Circulars.
-- ==============================================================================

-- 1. Ensure case_code has a UNIQUE constraint for idempotent upserts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'philhealth_packages_case_code_key'
  ) THEN
    ALTER TABLE public.philhealth_packages 
      ADD CONSTRAINT philhealth_packages_case_code_key UNIQUE (case_code);
  END IF;
END $$;

INSERT INTO public.philhealth_packages (
  procedure_keyword,
  case_code,
  hci_fee,
  prof_fee,
  total_case_rate,
  inclusive_items
)
VALUES
  -- 1. Surgical: Laparoscopic Cholecystectomy (Gallbladder Removal)
  (
    'Laparoscopic Cholecystectomy',
    '47562',
    23250.00,
    15500.00,
    38750.00,
    ARRAY[
      'Laparoscopic tower and instrument use',
      'CO2 insufflation gas',
      'Endoscopic surgical clips',
      'Surgical trocars and cannulas',
      'Standard sterile drape packs and surgical gowns',
      'Suture materials and skin closure tape',
      'Basic surgical gloves and disposable blades',
      'Routine operating room medications and local anesthesia',
      'Post-anesthesia care unit (PACU) recovery room charges',
      'Normal saline / Lactated Ringer''s IV fluids (first 48 hours)'
    ]
  ),

  -- 2. Surgical: Open Cholecystectomy
  (
    'Open Cholecystectomy',
    '47600',
    21000.00,
    14000.00,
    35000.00,
    ARRAY[
      'Standard laparotomy instrument tray',
      'Abdominal wall retractor use',
      'Surgical suction tubing and tips',
      'Suture materials (Vicryl, Chromic, Silk)',
      'Surgical sponges and laparotomy pads with radiopaque markers',
      'Basic OR sterile packs and gloves',
      'Standard surgical drain (Jackson-Pratt / Penrose)',
      'Routine intraoperative antibiotics (e.g., Cefazolin single dose)',
      'PACU recovery monitoring'
    ]
  ),

  -- 3. Surgical: Laparoscopic Appendectomy
  (
    'Laparoscopic Appendectomy',
    '44970',
    18000.00,
    12000.00,
    30000.00,
    ARRAY[
      'Laparoscopic camera system and monitor usage',
      'Laparoscopic instruments (dissector, grasper, scissors)',
      'Endoloop or endoscopic clips for appendix base ligation',
      'CO2 insufflation gas',
      'Standard surgical trocars',
      'Basic sterile packs, gloves, and surgical drapes',
      'Routine intra-op antibiotics and analgesics',
      'Recovery room accommodation and vital signs monitoring'
    ]
  ),

  -- 4. Surgical: Open Appendectomy
  (
    'Appendectomy (Open)',
    '44950',
    14400.00,
    9600.00,
    24000.00,
    ARRAY[
      'Standard appendectomy instrument set',
      'Sterile surgical drape set and OR linens',
      'Abdominal wall retractors',
      'Absorbable and non-absorbable surgical sutures',
      'Surgical gauze, sponges, and tape',
      'Surgical scalpel blades and gloves',
      'Routine IV fluids (0.9% NaCl or D5 LRS)',
      'PACU monitoring and routine post-op pain management'
    ]
  ),

  -- 5. Cardiovascular: Diagnostic Coronary Angiography (Cardiac Catheterization)
  (
    'Coronary Angiography (Cardiac Catheterization)',
    '93458',
    28500.00,
    19000.00,
    47500.00,
    ARRAY[
      'Cath lab facility and fluoroscopy machine usage',
      'Radial / femoral vascular introducer sheath',
      'Diagnostic coronary catheters (Judkins Left, Judkins Right, Pigtail)',
      'Standard 0.035 guidewire',
      'Standard non-ionic contrast media (up to 100mL)',
      'Heparin flush and routine antithrombotic medications',
      'Pressure monitoring lines and manifold set',
      'Sterile catheterization drape pack and operator gowns',
      'Hemostatic puncture compression device / bandage'
    ]
  ),

  -- 6. Cardiovascular: Percutaneous Coronary Intervention (Angioplasty / Stenting)
  (
    'Percutaneous Coronary Intervention (PCI / Angioplasty)',
    '92920',
    54000.00,
    36000.00,
    90000.00,
    ARRAY[
      'Cath lab intervention room and cine-angiography fees',
      'Guiding catheters and coronary guidewires (0.014)',
      'PTCA balloon dilatation catheter',
      'High-pressure inflation device (indeflator)',
      'Standard contrast media',
      'Intra-arterial vasodilators (Nitroglycerin / Diltiazem flush)',
      'Heparin anticoagulation and post-procedure ACT testing',
      'Sterile intervention pack and arterial closure dressing'
    ]
  ),

  -- 7. Maternal: Normal Spontaneous Delivery (NSD Package in Hospital)
  (
    'Normal Spontaneous Delivery (NSD)',
    '59400',
    6500.00,
    3900.00,
    10400.00,
    ARRAY[
      'Delivery room facility, labor bed, and monitoring',
      'Sterile delivery instrument pack',
      'Episiotomy repair sutures and local lidocaine infiltration',
      'Routine oxytocin / uterotonic drugs for third stage labor',
      'Basic neonatal care, suction bulb, umbilical cord clamp, and cord scissors',
      'Vitamin K injection and erythromycin eye ointment for newborn',
      'First 24 hours room and board for mother and baby',
      'Routine maternal hygiene kit and hospital linen'
    ]
  ),

  -- 8. Maternal: Cesarean Section Delivery (Low Cervical / Repeat)
  (
    'Cesarean Section Delivery',
    '59510',
    15600.00,
    10400.00,
    26000.00,
    ARRAY[
      'Operating room and delivery instrumentation set',
      'Standard spinal anesthesia tray and needle',
      'Sterile laparotomy drapes and surgical attire',
      'Uterine and abdominal wall suture materials (absorbable)',
      'Oxytocin / Methylergometrine uterotonic medications',
      'Immediate newborn resuscitation station usage',
      'PACU recovery monitoring',
      'Post-op IV fluids and basic analgesics (first 24-48 hours)'
    ]
  ),

  -- 9. Renal Care: Hemodialysis (Per Session Rate)
  (
    'Hemodialysis Session',
    '90935',
    4000.00,
    0.00,
    4000.00,
    ARRAY[
      'Hemodialysis machine utilization and dialysate solution',
      'Standard biocompatible dialyzer filter',
      'Arterial and venous blood tubing lines',
      'Fistula needles (AVF needles) or catheter connector caps',
      'Heparin sodium injection for circuit anticoagulation',
      'Normal saline flush (1000mL)',
      'Pre- and post-dialysis vital signs monitoring and nursing care',
      'Basic dressing kit and sterile gauze'
    ]
  ),

  -- 10. Medical: Community-Acquired Pneumonia - Moderate Risk (CAP-MR)
  (
    'Community-Acquired Pneumonia - Moderate Risk (CAP-MR)',
    'J18.9',
    10500.00,
    4500.00,
    15000.00,
    ARRAY[
      'Hospital room and board (standard ward / semi-private accommodation)',
      'Baseline CBC with platelet count, urinalysis, and sputum microscopy',
      'Chest X-Ray (AP/Lateral)',
      'First-line empiric IV antibiotics (e.g., Ceftriaxone / Ampicillin-Sulbactam)',
      'Standard IV cannula, infusion set, and hydration fluids',
      'Oxygen cannula / mask and oxygen inhalation therapy',
      'Nebulization treatments (Salbutamol / Ipratropium nebules)',
      'Daily vital signs and physician ward rounds'
    ]
  ),

  -- 11. Medical: Community-Acquired Pneumonia - High Risk (CAP-HR)
  (
    'Community-Acquired Pneumonia - High Risk (CAP-HR)',
    'J18.0',
    22400.00,
    9600.00,
    32000.00,
    ARRAY[
      'Intermediate care / step-down room accommodation and monitoring',
      'Arterial Blood Gas (ABG) and routine serum electrolytes (Na, K, Cl)',
      'Blood culture and sensitivity testing',
      'Chest radiography and repeated oxygen saturation tracking',
      'Broad-spectrum parenteral antibiotics and mucolytic therapy',
      'IV infusion sets, microdrip controllers, and electrolyte correction solutions',
      'High-flow oxygen or non-invasive respiratory support equipment fees',
      'Attending physician and pulmonary specialist co-management rounds'
    ]
  ),

  -- 12. Medical: Dengue Fever with Warning Signs
  (
    'Dengue Fever with Warning Signs',
    'A97.1',
    9100.00,
    3900.00,
    13000.00,
    ARRAY[
      'Hospital room accommodation and strict intake/output recording',
      'Serial CBC with hematocrit and platelet count monitoring (every 12-24h)',
      'Dengue NS1 antigen or Dengue IgM/IgG rapid test',
      'Maintenance and replacement crystalloid IV fluids (D5 LRS / 0.9% NaCl)',
      'IV cannula, extension tubing, and 3-way stopcock',
      'Oral rehydration salts (ORS) and paracetamol antipyretic tablets',
      'Routine nursing assessment for clinical bleeding signs'
    ]
  ),

  -- 13. Medical: Acute Gastroenteritis with Mild to Moderate Dehydration (AGE)
  (
    'Acute Gastroenteritis with Dehydration',
    'A09.9',
    6300.00,
    2700.00,
    9000.00,
    ARRAY[
      'Ward accommodation and dedicated hydration monitoring',
      'Fecalysis and routine routine urinalysis',
      'Electrolyte repletion IV fluids (D5 0.3% NaCl or Normosol-M)',
      'Pediatric/adult infusion set and catheter',
      'Oral rehydration therapy and zinc supplementation (pediatric)',
      'Antiemetic and antipyretic routine medications',
      'Inpatient nursing observation'
    ]
  ),

  -- 14. Surgical: Total Abdominal Hysterectomy with or without Oophorectomy
  (
    'Total Abdominal Hysterectomy',
    '58150',
    24000.00,
    16000.00,
    40000.00,
    ARRAY[
      'Major gynecologic OR instrumentation set and retractor',
      'Standard surgical linens, sterile drapes, and gowns',
      'Heavy absorbable and non-absorbable suture ties (Vicryl #1, #0)',
      'Electrocautery pencil and grounding pad',
      'Laparotomy sponges with radiopaque markers',
      'Foley catheter with urine bag for bladder decompression',
      'Intraoperative antibiotics and PACU recovery room services',
      'Post-op IV hydration and standard analgesia'
    ]
  ),

  -- 15. Surgical: Inguinal Herniorrhaphy (Hernia Repair with Mesh)
  (
    'Inguinal Hernia Repair (Herniorrhaphy)',
    '49505',
    13200.00,
    8800.00,
    22000.00,
    ARRAY[
      'Standard hernia surgical instrument set',
      'Sterile field drapes, gowns, and surgical gloves',
      'Monofilament polypropylene hernia mesh (standard size)',
      'Suture materials for mesh fixation and fascial closure (Prolene / Vicryl)',
      'Electrosurgery unit usage',
      'Local / spinal anesthesia tray and medication',
      'PACU recovery monitoring',
      'Post-procedure compression bandage'
    ]
  ),

  -- 16. Surgical: Cataract Extraction with Intraocular Lens (IOL)
  (
    'Cataract Extraction with Intraocular Lens (Phacoemulsification)',
    '66984',
    10800.00,
    7200.00,
    18000.00,
    ARRAY[
      'Phacoemulsification machine and ultrasonic handpiece use',
      'Ophthalmic microsurgical instrument set and eye speculum',
      'Foldable standard mono-focal intraocular lens (IOL)',
      'Ophthalmic viscoelastic device (OVD / Hyaluronic acid)',
      'Balanced Salt Solution (BSS) irrigating solution',
      'Sterile eye drape and corneal incision blades',
      'Topical / intracameral anesthesia and mydriatic drops',
      'Post-operative eye shield and protective patch'
    ]
  ),

  -- 17. Medical: Essential Hypertension / Hypertensive Crisis
  (
    'Hypertensive Urgency / Crisis',
    'I10',
    7000.00,
    3000.00,
    10000.00,
    ARRAY[
      'Inpatient bed accommodation with continuous automated BP monitoring',
      'Baseline 12-lead Electrocardiogram (ECG)',
      'Serum creatinine, BUN, and random blood glucose testing',
      'First-line antihypertensive medications (oral or IV Nicardipine titration)',
      'IV line access, infusion set, and micro-regulator',
      'Urine protein dipstick screening',
      'Attending physician cardiovascular assessment'
    ]
  ),

  -- 18. Medical: Type 2 Diabetes Mellitus with Acute Hyperglycemia / DKA
  (
    'Type 2 Diabetes with Acute Complications / DKA',
    'E11.1',
    14000.00,
    6000.00,
    20000.00,
    ARRAY[
      'Monitored bed accommodation and strict glucose charting',
      'Serial capillary blood glucose (CBG) monitoring test strips',
      'Baseline blood ketone test, ABG, and serum electrolytes',
      'Regular insulin infusion and sliding-scale titration',
      '0.9% Normal Saline and Potassium Chloride IV replacement solutions',
      'IV infusion pump usage fees',
      'Urinalysis with ketone detection',
      'Endocrine specialty evaluation'
    ]
  )

ON CONFLICT (case_code) DO UPDATE SET
  procedure_keyword = EXCLUDED.procedure_keyword,
  hci_fee = EXCLUDED.hci_fee,
  prof_fee = EXCLUDED.prof_fee,
  total_case_rate = EXCLUDED.total_case_rate,
  inclusive_items = EXCLUDED.inclusive_items;

