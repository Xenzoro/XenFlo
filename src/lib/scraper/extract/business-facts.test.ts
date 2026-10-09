import { describe, expect, it } from "vitest";
import { parseCopyright, parseEmployeeCount, parseLegalEntity } from "./business-facts";
import { entityTypeFromSuffix } from "../entity-suffixes";

// All footers and legal text below are made up.
describe("parseCopyright", () => {
  it.each([
    ["© 2024 Sunny Paws Grooming LLC. All rights reserved.", "Sunny Paws Grooming LLC", "LLC"],
    ["© 2021 Desert Bloom Florals L.L.C.", "Desert Bloom Florals L.L.C.", "LLC"],
    ["Copyright 2025 Red Rock Plumbing, Inc. All rights reserved.", "Red Rock Plumbing, Inc.", "Corporation"],
    ["© 2019-2025 Mesa Tile Incorporated", "Mesa Tile Incorporated", "Corporation"],
    ["© 2023 Canyon Freight Corp.", "Canyon Freight Corp.", "Corporation"],
    ["© 2023 Summit Logistics Corporation", "Summit Logistics Corporation", "Corporation"],
    ["© 2022 Hale & Ortiz LLP | Privacy", "Hale & Ortiz LLP", "Partnership"],
    ["© 2022 Juniper Ventures LP", "Juniper Ventures LP", "Partnership"],
    ["© 2024 Bright Smile Dental PLLC", "Bright Smile Dental PLLC", "Professional LLC"],
    ["© 2024 Valley Law Group, P.C.", "Valley Law Group, P.C.", "Professional corporation"],
    ["Copyright © 2020 Harbor Tea Ltd.", "Harbor Tea Ltd.", "Limited company"],
    ["© 2026 by Neon Noodle Bar LLC.", "Neon Noodle Bar LLC", "LLC"],
  ])("%s", (text, legalName, entityType) => {
    expect(parseCopyright(text)).toMatchObject({ legalName, entityType });
  });

  it("keeps the start of a year range as a hint", () => {
    expect(parseCopyright("© 2014-2025 Apex Hosting LLC")?.startYear).toBe(2014);
  });

  it("ignores the site builder or theme", () => {
    expect(parseCopyright("© 2024 Wix.com Ltd. Proudly created with Wix")).toBeNull();
    expect(parseCopyright("Copyright © 2025 Kadence WP")).toBeNull();
    // ...but still finds the business when it's there too
    expect(parseCopyright("© 2024 Wix.com Ltd · © 2024 Neon Noodle Bar LLC")?.legalName).toBe("Neon Noodle Bar LLC");
  });

  it("leaves the entity empty without a suffix (no guessing sole proprietor)", () => {
    expect(parseCopyright("© 2026 by Neon Noodle Bar. All Right Reserved.")).toBeNull();
    expect(parseCopyright("Copyright © 2024 Boba Moon Cafe")).toBeNull();
  });

  it("doesn't read a lowercase legal sentence as a copyright line", () => {
    expect(parseCopyright("content that infringes copyright, trademark, privacy or other rights of Limited users")).toBeNull();
  });
});

describe("entityTypeFromSuffix", () => {
  it("returns null for unknown suffixes", () => {
    expect(entityTypeFromSuffix("GmbH")).toBeNull();
  });
});

describe("parseLegalEntity", () => {
  const words = ["sunnypawsgrooming", "sunny", "paws", "grooming"];

  it("reads the business's own defined name", () => {
    const text = "Last Updated: May 2025 Sunny Paws Grooming, LLC, and our affiliates Paws East LLC (“Sunny Paws”, “we” or “us”) provide grooming.";
    expect(parseLegalEntity(text, words)).toMatchObject({ legalName: "Sunny Paws Grooming, LLC", entityType: "LLC" });
  });

  it("reads 'operated by'", () => {
    expect(parseLegalEntity("This website is operated by Sunny Paws Grooming Inc. in Henderson.", words)).toMatchObject({
      legalName: "Sunny Paws Grooming Inc.",
      entityType: "Corporation",
    });
  });

  it("rejects third parties named on the same page", () => {
    const text = "Share buttons for Facebook, operated by Facebook Inc., 1 Hacker Way. Surveys by Formly, Inc. (“Formly”) are optional.";
    expect(parseLegalEntity(text, words)).toBeNull();
  });
});

describe("parseEmployeeCount", () => {
  it("keeps the noun when it isn't the whole company", () => {
    expect(parseEmployeeCount("Our team of 200+ technicians is ready.")?.value).toBe("200+ technicians");
  });

  it("keeps the location scope", () => {
    expect(parseEmployeeCount("119 Service Trucks 168 HVAC & Plumbing Technicians at your service", "Las Vegas")?.value).toBe(
      "168 technicians (Las Vegas)",
    );
  });

  it("stores a whole-company count as stated, never rounded", () => {
    expect(parseEmployeeCount("We now have over 50 employees across the valley.")?.value).toBe("Over 50");
    expect(parseEmployeeCount("A family business with 12 full-time staff.")?.value).toBe("12");
    expect(parseEmployeeCount("1,200 team members strong")?.value).toBe("1,200");
  });

  it("keeps the quote as evidence", () => {
    expect(parseEmployeeCount("We now have over 50 employees across the valley.")?.quote).toContain("over 50 employees");
  });

  it("ignores phrases that aren't a headcount", () => {
    expect(parseEmployeeCount("The 3 technicians who came out were great!")).toBeNull();
    expect(parseEmployeeCount("Celebrating 50 years serving our employees and neighbors")).toBeNull();
    expect(parseEmployeeCount("One technician arrived within 1 hour")).toBeNull();
    expect(parseEmployeeCount("Founded 1939 employees owned")).toBeNull();
  });
});
