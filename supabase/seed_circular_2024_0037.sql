-- ==============================================================================
-- BillLens PH: PhilHealth Circular No. 2024-0037 (+50% ACR Adjustment) Seed
-- Effective Date: January 1, 2025
-- ==============================================================================
-- 1. Preserves historical pre-2025 rows with effective_to = '2024-12-31',
--    circular_number = 'PC-2013-0035', and superseded_by = 'PC-2024-0037'
--    so admission-date time travel audits pre-2025 bills accurately.
-- 2. Seeds verified Circular No. 2024-0037 (+50% ACR) rows effective 2025-01-01
--    with explicit official splits (60% HCI / 40% PF for surgical RVS codes,
--    70% HCI / 30% PF for medical ICD-10 codes).
-- ==============================================================================

-- Ensure migration 009 columns exist if run standalone
ALTER TABLE public.philhealth_packages
  ADD COLUMN IF NOT EXISTS circular_number TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by TEXT;

-- Step 1: Close out existing pre-2025 rows cleanly
UPDATE public.philhealth_packages
SET
  effective_to = '2024-12-31',
  circular_number = COALESCE(NULLIF(circular_number, ''), 'PC-2013-0035'),
  superseded_by = 'PC-2024-0037'
WHERE effective_from < '2025-01-01'
  AND (effective_to IS NULL OR effective_to >= '2025-01-01');

-- Step 2: Ensure historical RVS 44950 (Pre-2025: ₱31,200) is present for time-travel audits
INSERT INTO public.philhealth_packages (
  case_code,
  procedure_keyword,
  circular_id,
  circular_number,
  effective_from,
  effective_to,
  superseded_by,
  source_url,
  is_verified,
  hci_fee,
  prof_fee,
  total_case_rate,
  inclusive_items
)
VALUES (
  '44950',
  'Open Appendectomy',
  '2013-0035',
  'PC-2013-0035',
  '2014-01-01',
  '2024-12-31',
  'PC-2024-0037',
  'https://www.philhealth.gov.ph/circulars/2013/',
  true,
  18720.00,
  12480.00,
  31200.00,
  ARRAY[
    'Standard appendectomy surgical instrument set',
    'Sterile surgical drapes, gowns, and gloves',
    'Abdominal wall retractor and suction tubing',
    'Suture materials and surgical gauze',
    'Laparotomy pads and disposable scalpel blades',
    'PACU recovery monitoring'
  ]
)
ON CONFLICT (case_code, effective_from) DO UPDATE SET
  procedure_keyword = EXCLUDED.procedure_keyword,
  circular_id = EXCLUDED.circular_id,
  circular_number = EXCLUDED.circular_number,
  effective_to = EXCLUDED.effective_to,
  superseded_by = EXCLUDED.superseded_by,
  source_url = EXCLUDED.source_url,
  is_verified = EXCLUDED.is_verified,
  hci_fee = EXCLUDED.hci_fee,
  prof_fee = EXCLUDED.prof_fee,
  total_case_rate = EXCLUDED.total_case_rate,
  inclusive_items = EXCLUDED.inclusive_items;

-- Step 3: Seed Verified PhilHealth Circular No. 2024-0037 (+50% ACR) Effective 2025-01-01
INSERT INTO public.philhealth_packages (
  case_code,
  procedure_keyword,
  circular_id,
  circular_number,
  effective_from,
  effective_to,
  superseded_by,
  source_url,
  is_verified,
  hci_fee,
  prof_fee,
  total_case_rate,
  inclusive_items
)
VALUES
  -- Surgical RVS Packages (60% HCI / 40% PF)
  (
    '44950',
    'Open Appendectomy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    28080.00,
    18720.00,
    46800.00,
    ARRAY[
      'Standard appendectomy surgical instrument set',
      'Sterile surgical drapes, gowns, and gloves',
      'Abdominal wall retractor and suction tubing',
      'Suture materials and surgical gauze',
      'Laparotomy pads and disposable scalpel blades',
      'PACU recovery monitoring'
    ]
  ),
  (
    '44970',
    'Laparoscopic Appendectomy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    27000.00,
    18000.00,
    45000.00,
    ARRAY[
      'Laparoscopic camera system and monitor usage',
      'Laparoscopic instruments (dissector, grasper, scissors)',
      'Endoloop or endoscopic clips for appendix base ligation',
      'CO2 insufflation gas and surgical trocars',
      'Basic sterile packs, gloves, and surgical drapes',
      'Recovery room accommodation and vital signs monitoring'
    ]
  ),
  (
    '47562',
    'Laparoscopic Cholecystectomy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    34875.00,
    23250.00,
    58125.00,
    ARRAY[
      'Laparoscopic tower and instrument use',
      'CO2 insufflation gas and endoscopic surgical clips',
      'Surgical trocars and cannulas',
      'Standard sterile drape packs and surgical gowns',
      'Suture materials and skin closure tape',
      'PACU recovery room charges'
    ]
  ),
  (
    '47600',
    'Open Cholecystectomy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    31500.00,
    21000.00,
    52500.00,
    ARRAY[
      'Standard laparotomy instrument tray',
      'Abdominal wall retractor and suction tubing',
      'Suture materials (Vicryl, Chromic, Silk)',
      'Surgical sponges and laparotomy pads',
      'Standard surgical drain (Jackson-Pratt / Penrose)',
      'PACU recovery monitoring'
    ]
  ),
  (
    '59510',
    'Cesarean Section',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    17100.00,
    11400.00,
    28500.00,
    ARRAY[
      'Spinal anesthesia tray, needle, and bupivacaine',
      'Laparotomy drape and suture materials',
      'Oxytocin and uterotonic medications',
      'PACU recovery monitoring'
    ]
  ),
  (
    '59400',
    'Normal Spontaneous Delivery',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    5850.00,
    3900.00,
    9750.00,
    ARRAY[
      'Delivery room use and standard delivery pack',
      'Episiotomy supplies and lidocaine',
      'Oxytocin, cord clamp, and suction bulb',
      'Vitamin K and erythromycin eye ointment'
    ]
  ),
  (
    '49505',
    'Inguinal Herniorrhaphy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    18900.00,
    12600.00,
    31500.00,
    ARRAY[
      'Polypropylene hernia mesh and suture materials',
      'Surgical drape and spinal anesthesia tray',
      'Compression bandage and PACU monitoring'
    ]
  ),
  (
    '58150',
    'Total Abdominal Hysterectomy',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    27000.00,
    18000.00,
    45000.00,
    ARRAY[
      'Abdominal retractor, surgical drape, and sutures',
      'Electrocautery grounding pad and laparotomy sponge',
      'Foley catheter, urine bag, and PACU recovery'
    ]
  ),
  (
    '66984',
    'Cataract Extraction with IOL',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    14400.00,
    9600.00,
    24000.00,
    ARRAY[
      'Phacoemulsification consumables and foldable IOL',
      'Viscoelastic (OVD) and balanced salt solution (BSS)',
      'Eye drape, eye shield, and mydriatic drops'
    ]
  ),
  -- Medical ICD-10 Packages (70% HCI / 30% PF)
  (
    'J18.9',
    'Pneumonia Moderate Risk',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    15750.00,
    6750.00,
    22500.00,
    ARRAY[
      'Chest X-ray, CBC, urinalysis, and sputum workup',
      'First-line IV antibiotics (Ceftriaxone / Ampicillin)',
      'IV cannula, infusion set, oxygen, and nebulization'
    ]
  ),
  (
    'J18.0',
    'Pneumonia High Risk',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    33600.00,
    14400.00,
    48000.00,
    ARRAY[
      'Arterial blood gas (ABG), serum electrolytes, and blood culture',
      'Chest X-ray and high-flow oxygen therapy',
      'Infusion set and microdrip IV consumables'
    ]
  ),
  (
    'A97.1',
    'Dengue Fever with Warning Signs',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    10500.00,
    4500.00,
    15000.00,
    ARRAY[
      'Serial CBC, hematocrit, platelet count, and NS1/IgM',
      'IV cannula, stopcock, extension tubing, and hydration',
      'Oral rehydration salts and paracetamol'
    ]
  ),
  (
    'A09.9',
    'Acute Gastroenteritis',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    6300.00,
    2700.00,
    9000.00,
    ARRAY[
      'Fecalysis and urinalysis',
      'IV hydration (Normosol / Lactated Ringer) and infusion set',
      'Oral rehydration therapy and zinc supplementation'
    ]
  ),
  (
    'I10',
    'Essential Hypertension',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    9450.00,
    4050.00,
    13500.00,
    ARRAY[
      'ECG, serum creatinine, BUN, blood glucose, and urine protein',
      'Antihypertensive medications (e.g., Nicardipine) and infusion set'
    ]
  ),
  (
    'E11.1',
    'Diabetes Mellitus with Ketoacidosis',
    '2024-0037',
    'PC-2024-0037',
    '2025-01-01',
    NULL,
    NULL,
    'https://www.philhealth.gov.ph/circulars/2024/',
    true,
    13230.00,
    5670.00,
    18900.00,
    ARRAY[
      'Capillary blood glucose (CBG), test strips, blood ketone, ABG, and electrolytes',
      'Regular insulin, potassium chloride, and infusion pump use'
    ]
  )
ON CONFLICT (case_code, effective_from) DO UPDATE SET
  procedure_keyword = EXCLUDED.procedure_keyword,
  circular_id = EXCLUDED.circular_id,
  circular_number = EXCLUDED.circular_number,
  effective_to = EXCLUDED.effective_to,
  superseded_by = EXCLUDED.superseded_by,
  source_url = EXCLUDED.source_url,
  is_verified = EXCLUDED.is_verified,
  hci_fee = EXCLUDED.hci_fee,
  prof_fee = EXCLUDED.prof_fee,
  total_case_rate = EXCLUDED.total_case_rate,
  inclusive_items = EXCLUDED.inclusive_items;
