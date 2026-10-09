/*
  Mock "Content Kit preview" for the Overview tab: one social post, one email subject
  and one blog idea, filled from templates using only facts already in the knowledge base.
  No AI call and no invented facts: when we don't know something, the template stays generic.
  Shown with an "AI preview" badge so nobody mistakes it for real generated content.
*/
import type { KnowledgeBase } from "@/types/knowledge";

export interface ContentPreview {
  socialPost: string;
  emailSubject: string;
  blogIdea: string;
}

export function mockContentPreview(kb: KnowledgeBase): ContentPreview {
  const name = kb.company.name.value || kb.companyName || "your business";
  const offering = kb.offerings.find((o) => o.value)?.value?.name ?? null;
  const theme = kb.contentKit.contentPillars[0]?.value ?? kb.insights.contentThemes[0]?.value ?? null;
  const faq = kb.insights.faqs.find((f) => f.value)?.value?.question ?? null;
  const city = kb.company.mainAddress.value?.city ?? null;
  const tag = name.replace(/[^a-z0-9]/gi, "");

  const socialPost = offering
    ? `Looking for ${offering.toLowerCase().startsWith("the ") ? offering : `the right ${offering}`}? ${name} has you covered. Tap the link to get started today. #${tag}`
    : `Behind every great experience is a team that cares. That's what we do at ${name}${city ? ` in ${city}` : ""}. Say hi! #${tag}`;

  const emailSubject = offering ? `Your ${offering} is waiting at ${name}` : `A quick hello from ${name}`;

  const blogIdea = faq
    ? `Answering your top question: "${faq.replace(/\?*$/, "?")}"`
    : theme
      ? `${theme}: what ${name} has learned`
      : `5 things to know before choosing ${name}`;

  return { socialPost, emailSubject, blogIdea };
}
