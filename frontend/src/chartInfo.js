export const CHART_OPTIONS = [
  { value: "xbar_r", label: "X̄–R chart (measurements: mean and range)" },
  { value: "p_chart", label: "p chart (fraction defective)" },
  { value: "np_chart", label: "np chart (number defective)" },
  { value: "c_chart", label: "c chart (defects per unit)" },
  { value: "u_chart", label: "u chart (defects per unit, size varies)" },
];

export const CHART_GUIDE = [
  ["You measured something (length, weight, time)", "X̄–R chart"],
  ["You counted defective items and sample size varies", "p chart"],
  ["You counted defective items and sample size is constant", "np chart (or p chart)"],
  ["You counted defects on each unit and the unit size is constant", "c chart"],
  ["You counted defects and the amount inspected varies", "u chart"],
];

export const GENERAL_BENEFITS = [
  "Separates common-cause variation from special-cause variation, so you react only when something has really changed.",
  "Spots problems while production is running, so it supports prevention instead of inspecting defects out afterwards.",
  "Cuts scrap, rework and inspection cost.",
  "Stops over-adjustment: tampering with a stable process makes it worse.",
  "Gives operators, supervisors and managers one shared, visual record of how the process behaves.",
  "Shows whether an improvement actually worked.",
  "A stable process is the starting point for a process capability study.",
];

export const GENERAL_APPLICATIONS = [
  "Manufacturing: dimensions, weights, torque, surface defects, rejected lots.",
  "Healthcare: infection rates, medication errors, patient waiting time.",
  "Banking and offices: data-entry errors, invoice mistakes, processing time.",
  "Software: defects per module, failed builds, response time.",
  "Logistics and food: late deliveries, fill weight, temperature.",
];

export const CHART_INFO = {
  xbar_r: {
    name: "X̄–R chart",
    dataType: "Variables data: measured on a continuous scale.",
    summary:
      "Two charts used together. The X̄ chart follows the average of each subgroup, and the R chart follows the spread (range) within each subgroup. Together they show whether both the centre and the variation of the process are stable.",
    whenToUse: [
      "The quality characteristic is measured (length, weight, time, temperature).",
      "Small subgroups of equal size (usually 2 to 10) are taken at regular intervals.",
      "You want to watch the average and the variability at the same time.",
    ],
    formulas: [
      "X̿ = ΣX̄ ÷ k   (grand mean of the k subgroup means)",
      "R̄ = ΣR ÷ k   (mean of the k ranges)",
      "X̄ chart:  UCL = X̿ + A₂R̄,   LCL = X̿ − A₂R̄",
      "R chart:   UCL = D₄R̄,   LCL = D₃R̄",
      "A₂, D₃ and D₄ come from the constants table for subgroup size n.",
    ],
    reading: [
      "Read the R chart first. If the spread is out of control, the X̄ limits cannot be trusted.",
      "A point above the UCL or below the LCL signals a special cause.",
      "Seven or more points in a row on one side of the centre line suggest the process has shifted.",
      "Control limits describe what the process does. They are not specification limits.",
    ],
    benefits: [
      "Monitors the centre and the spread together.",
      "Averaging makes the X̄ chart sensitive to small shifts in the mean.",
      "Needs only small samples and simple arithmetic.",
    ],
    applications: [
      "Diameter of machined shafts.",
      "Fill weight of packets or bottles.",
      "Coating thickness on a sheet.",
      "Average and spread of turnaround time in a service desk.",
    ],
    inputs: {
      primary: "Sample means (X̄)",
      primaryHint: "One mean per subgroup, in order. Separate with commas or spaces.",
      primaryPlaceholder: "10.2, 10.5, 9.8, 10.1",
      secondary: "Sample ranges (R)",
      secondaryHint: "Same number of values as the means.",
      secondaryPlaceholder: "0.8, 1.1, 0.7, 0.9",
      n: "Subgroup size (n)",
      nPlaceholder: "5",
      raw: true,
    },
  },

  p_chart: {
    name: "p chart",
    dataType: "Attribute data: items are classed as defective or not.",
    summary:
      "Tracks the fraction of defective items in each sample. Because it uses a proportion, the sample size is allowed to change from sample to sample, and the control limits then change with it.",
    whenToUse: [
      "Each item is judged conforming or non-conforming (pass or fail).",
      "Sample size may vary.",
      "You want one chart that covers several quality characteristics, since an item fails if any one is wrong.",
    ],
    formulas: [
      "p = d ÷ n   for each sample (d defectives out of n inspected)",
      "p̄ = Σd ÷ Σn",
      "UCL = p̄ + 3√( p̄(1 − p̄) ÷ n )",
      "LCL = p̄ − 3√( p̄(1 − p̄) ÷ n )   (take 0 if negative)",
    ],
    reading: [
      "When n varies, the limits step in and out. Compare each point with its own limits.",
      "A point above the UCL means the fraction defective jumped, so look for a special cause.",
      "A point below the LCL is good news, but check that inspection did not change.",
      "Expect about 5 defectives per sample on average or more, or the limits are only rough.",
    ],
    benefits: [
      "Handles samples of different sizes.",
      "One chart can summarise many defect types.",
      "A percentage is easy for management to understand.",
    ],
    applications: [
      "Fraction of rejected castings per lot.",
      "Proportion of late deliveries per week.",
      "Share of invoices containing errors.",
      "Proportion of patients readmitted within 30 days.",
    ],
    inputs: {
      primary: "Number defective in each sample",
      primaryHint: "One count per sample, in order.",
      primaryPlaceholder: "12, 15, 9, 18, 11, 14",
      secondary: "Sample sizes (only if they differ)",
      secondaryHint: "Leave empty if every sample has the same size.",
      secondaryPlaceholder: "200, 180, 220, 200, 210, 190",
      n: "Constant sample size (n)",
      nPlaceholder: "200",
    },
  },

  np_chart: {
    name: "np chart",
    dataType: "Attribute data: items are classed as defective or not.",
    summary:
      "Plots the number of defective items in each sample. It tells the same story as the p chart but needs a constant sample size, and the counts are easier for operators to plot.",
    whenToUse: [
      "Each item is conforming or non-conforming.",
      "Every sample has exactly the same size.",
      "You want to plot whole numbers instead of fractions.",
    ],
    formulas: [
      "n p̄ = Σd ÷ k   (average number defective)",
      "p̄ = n p̄ ÷ n",
      "UCL = n p̄ + 3√( n p̄(1 − p̄) )",
      "LCL = n p̄ − 3√( n p̄(1 − p̄) )   (take 0 if negative)",
    ],
    reading: [
      "The limits are flat because n never changes.",
      "A point above the UCL means more defectives than chance explains.",
      "Seven or more points in a row on one side of the centre line point to a shift.",
    ],
    benefits: [
      "Plots simple counts, so no division is needed on the shop floor.",
      "Flat limits are easy to read.",
    ],
    applications: [
      "Defective bulbs in a box of 100.",
      "Rejected PCBs in each batch of 50.",
      "Rivets that fail a check in each sample of 30.",
    ],
    inputs: {
      primary: "Number defective in each sample",
      primaryHint: "One count per sample, in order.",
      primaryPlaceholder: "4, 6, 3, 7, 5, 2",
      n: "Constant sample size (n)",
      nPlaceholder: "50",
    },
  },

  c_chart: {
    name: "c chart",
    dataType: "Attribute data: defects are counted on each unit.",
    summary:
      "Plots the number of defects found in each inspection unit. A unit can hold many defects, so the count is not limited by the sample size. It assumes every unit offers the same area of opportunity.",
    whenToUse: [
      "You count defects (scratches, flaws, errors), not defective items.",
      "Each inspection unit has the same size or opportunity for defects.",
      "Defects are rare and occur independently (a Poisson pattern).",
    ],
    formulas: [
      "c̄ = Σc ÷ k   (average defects per unit)",
      "UCL = c̄ + 3√c̄",
      "LCL = c̄ − 3√c̄   (take 0 if negative)",
    ],
    reading: [
      "A defective item can contain several defects, so c counts and np counts are not the same thing.",
      "A point above the UCL means a unit had more defects than expected.",
      "Seven or more points in a row on one side of the centre line point to a shift.",
    ],
    benefits: [
      "Measures the quality of complex products that carry many possible defects.",
      "Needs only one average, so the limits are quick to compute.",
    ],
    applications: [
      "Flaws per roll of fabric.",
      "Scratches per painted panel.",
      "Solder defects per circuit board.",
      "Typing errors per page.",
    ],
    inputs: {
      primary: "Defects found in each inspection unit",
      primaryHint: "One count per unit, in order.",
      primaryPlaceholder: "6, 4, 8, 5, 9, 3",
    },
  },

  u_chart: {
    name: "u chart",
    dataType: "Attribute data: defects are counted and the amount inspected varies.",
    summary:
      "Plots the number of defects per unit inspected. It is the c chart for the case where the sample size or area changes, so the limits change with it.",
    whenToUse: [
      "You count defects, not defective items.",
      "The number of units inspected differs from sample to sample.",
    ],
    formulas: [
      "u = c ÷ n   for each sample (c defects in n units)",
      "ū = Σc ÷ Σn",
      "UCL = ū + 3√( ū ÷ n )",
      "LCL = ū − 3√( ū ÷ n )   (take 0 if negative)",
    ],
    reading: [
      "When n varies, compare each point with its own limits.",
      "A point above the UCL means the defect rate per unit rose.",
      "Seven or more points in a row on one side of the centre line point to a shift.",
    ],
    benefits: [
      "Copes with unequal sample sizes.",
      "Puts every sample on the same defects-per-unit scale.",
    ],
    applications: [
      "Defects per 100 metres of cable.",
      "Errors per 1000 lines of code.",
      "Complaints per 1000 customers served.",
    ],
    inputs: {
      primary: "Defects found in each sample",
      primaryHint: "One count per sample, in order.",
      primaryPlaceholder: "14, 9, 17, 11, 12",
      secondary: "Units inspected per sample (only if they differ)",
      secondaryHint: "Leave empty if every sample has the same number of units.",
      secondaryPlaceholder: "5, 4, 6, 5, 5",
      n: "Constant units per sample",
      nPlaceholder: "5",
    },
  },
};