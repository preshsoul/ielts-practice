import { faker } from "@faker-js/faker";

const NATIONALITIES = [
  "Nigerian",
  "Ghanaian",
  "Kenyan",
  "Indian",
  "Pakistani",
  "South African",
];

const DISCIPLINES = [
  "Computer Science",
  "Public Health",
  "Mechanical Engineering",
  "Economics",
  "Data Science",
  "Education",
];

const DEGREE_CLASSES = ["First Class", "Second Class Upper", "Second Class Lower"];
const TARGET_COUNTRIES = [
  ["United Kingdom", "Canada"],
  ["Germany", "Sweden"],
  ["Netherlands", "Ireland"],
  ["United States", "Canada"],
];

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildFakeAddressBlock() {
  const street = faker.location.streetAddress();
  const city = faker.location.city();
  const state = faker.location.state();
  const zipCode = faker.location.zipCode();
  const country = faker.location.country();
  return {
    street,
    city,
    state,
    zipCode,
    country,
    line: `${street}, ${city}, ${state} ${zipCode}, ${country}`,
  };
}

export function buildFakeParserPayload(index = 0) {
  const fullName = faker.person.fullName();
  const email = faker.internet.email({ firstName: fullName.split(" ")[0], lastName: fullName.split(" ").slice(-1)[0] });
  const phone = faker.phone.number();
  const address = buildFakeAddressBlock();
  const nationality = randomFrom(NATIONALITIES);
  const discipline = randomFrom(DISCIPLINES);
  const degreeClass = randomFrom(DEGREE_CLASSES);
  const targetCountries = randomFrom(TARGET_COUNTRIES);
  const graduationYear = faker.number.int({ min: 2018, max: 2025 });
  const ielts = Number(faker.number.float({ min: 6, max: 8.5, fractionDigits: 1 }));
  const workExperienceYears = faker.number.int({ min: 0, max: 6 });
  const institution = `${faker.company.name()} University`;
  const sourceFilename = `faker-user-${index + 1}.txt`;
  const extractedText = [
    `${fullName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Address: ${address.line}`,
    `Nationality: ${nationality}`,
    `BSc ${discipline}`,
    `${institution}, ${graduationYear}`,
    `${degreeClass}`,
    `IELTS Overall Band Score: ${ielts}`,
    `${workExperienceYears} years experience`,
  ].join("\n");

  return {
    label: `CV intake ${index + 1} - ${fullName}`,
    sourceFilename,
    mimeType: "text/plain",
    documentType: "text",
    rawTextHash: faker.string.uuid(),
    extractedExcerpt: `${discipline}, ${degreeClass}, ${address.city}`,
    extractedText,
    keywords: [discipline, nationality, address.country, "IELTS"],
    confidence: Number(faker.number.float({ min: 0.7, max: 0.98, fractionDigits: 2 })),
    parsedProfile: {
      identity: {
        nationality,
        countryOfResidence: address.country,
        ageAtApplicationCycle: faker.number.int({ min: 21, max: 38 }),
      },
      academic: {
        degreeClass,
        institution,
        institutionCountry: address.country,
        discipline,
        disciplineCategory: discipline,
        graduationYear,
        cgpa: null,
        cgpaScale: 5,
        degreeLevel: "Bachelor's",
      },
      professional: {
        workExperienceYears,
        currentlyEmployed: workExperienceYears > 0 ? "yes" : "no",
        sector: discipline,
      },
      languageTests: {
        ielts,
        toefl: null,
        celpip: null,
      },
      applicationCycle: "2026",
      targetDegreeLevel: "Master's",
      targetDisciplines: [discipline],
      targetCountries,
      keywords: [discipline, nationality],
    },
    parsedCandidateProfile: {
      personal_details: {
        full_legal_name: fullName,
        email,
        phone,
        nationality: {
          id: nationality.toLowerCase().replace(/\s+/g, "_"),
          label: nationality,
          raw_text: nationality,
        },
        country_of_residence: {
          id: address.country.toLowerCase().replace(/\s+/g, "_"),
          label: address.country,
          raw_text: address.country,
        },
      },
      academic_history: [
        {
          institution,
          institution_country: address.country,
          degree_type: "bsc",
          academic_discipline: discipline,
          degree_class: {
            id: degreeClass.toLowerCase().replace(/\s+/g, "_"),
            label: degreeClass,
            raw_text: degreeClass,
          },
          graduation_date: `${graduationYear}-07-01`,
          graduation_year: graduationYear,
          cgpa: null,
          cgpa_scale: 5,
        },
      ],
      professional_experience_years: workExperienceYears,
      international_exams: {
        ielts_band_score: ielts,
        toefl_score: null,
        celpip_score: null,
      },
      grade: {
        scheme: "degree_class",
        normalized: degreeClass,
        raw: degreeClass,
        cgpa: null,
        scale: 5,
      },
      keywords: [discipline, nationality, address.country],
      raw_text_snippet: extractedText.slice(0, 400),
    },
    provenance: {
      parser_version: "cv-parser-v2",
      method: "faker-stress",
      model: "synthetic-user-generator",
      parsed_at: new Date().toISOString(),
    },
  };
}

export function buildFakeParserPayloads({ count = 10 } = {}) {
  return Array.from({ length: count }, (_, index) => buildFakeParserPayload(index));
}
