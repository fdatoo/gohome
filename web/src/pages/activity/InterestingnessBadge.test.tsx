import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterestingnessBadge } from "./InterestingnessBadge";
import type { InterestingnessCategory } from "../../gen/activity/v1/activity_pb";

const ALL_CATEGORIES: InterestingnessCategory[] = [
  "failure",
  "performance",
  "causation",
  "anomaly",
  "security",
  "configuration",
  "novelty",
];

describe("InterestingnessBadge", () => {
  for (const category of ALL_CATEGORIES) {
    it(`renders badge with data-interesting-category="${category}"`, () => {
      render(<InterestingnessBadge category={category} name={`${category}_tag`} />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("data-interesting-category", category);
    });

    it(`renders no style attribute on ${category} badge`, () => {
      render(<InterestingnessBadge category={category} />);
      const badge = screen.getByRole("status");
      expect(badge).not.toHaveAttribute("style");
    });
  }
});
