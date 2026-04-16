export const INSTITUTIONS = [
  {
    id: 'u-glasgow-math',
    name: 'University of Glasgow',
    country: 'UK',
    city: 'Glasgow',
    tuition_international_yearly: 21000,
    currency: 'GBP',
    typical_program_length_months: 12,
    living_cost_monthly_by_city: { Glasgow: 900, Edinburgh: 1000, London: 1400 },
    IHS_per_year: 776,
    CAS_issuance_speed: 'fast',
    research_areas: ['linguistics', 'applied linguistics', 'education'],
    website: 'https://www.gla.ac.uk',
    notes: 'Strong applied linguistics group.'
  },
  {
    id: 'u-edinburgh-ecs',
    name: 'University of Edinburgh',
    country: 'UK',
    city: 'Edinburgh',
    tuition_international_yearly: 23000,
    currency: 'GBP',
    typical_program_length_months: 12,
    living_cost_monthly_by_city: { Glasgow: 900, Edinburgh: 1050, London: 1400 },
    IHS_per_year: 776,
    CAS_issuance_speed: 'average',
    research_areas: ['computational linguistics', 'education'],
    website: 'https://www.ed.ac.uk',
    notes: 'Large postgraduate cohort.'
  },
  {
    id: 'u-london-king',
    name: 'King\'s College London',
    country: 'UK',
    city: 'London',
    tuition_international_yearly: 26000,
    currency: 'GBP',
    typical_program_length_months: 12,
    living_cost_monthly_by_city: { Glasgow: 900, Edinburgh: 1000, London: 1700 },
    IHS_per_year: 776,
    CAS_issuance_speed: 'slow',
    research_areas: ['education', 'psychology'],
    website: 'https://www.kcl.ac.uk',
    notes: 'High living costs in London.'
  }
];

export default INSTITUTIONS;
