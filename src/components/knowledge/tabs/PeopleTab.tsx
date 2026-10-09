"use client";

/*
  People: team members and customers/partners in separate sections, so testimonial
  authors never get mixed into the team.
*/
import type { Person } from "@/types/knowledge";
import type { FormField } from "@/components/ui/RecordForm";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/Card";
import { RecordList } from "@/components/ui/RecordList";

const FIELDS: FormField[] = [
  { key: "name", label: "Name", required: true },
  { key: "title", label: "Title", placeholder: "e.g. Founder & CEO" },
  { key: "role", label: "Role", placeholder: "e.g. Leadership" },
  { key: "bio", label: "Short bio", kind: "textarea" },
  { key: "imageUrl", label: "Photo URL" },
  {
    key: "type",
    label: "Type",
    kind: "select",
    options: [
      { value: "team", label: "Team member" },
      { value: "customer_partner", label: "Customer or partner" },
    ],
  },
];

const blank = (type: Person["type"]): Person => ({ name: "", title: null, role: null, bio: null, imageUrl: null, type });

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div className="flex gap-3 pr-14">
      {person.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote photos from any domain
        <img src={person.imageUrl} alt={person.name} className="size-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initials(person.name)}</span>
      )}
      <div className="min-w-0">
        <p className="font-semibold">{person.name}</p>
        {(person.title || person.role) && <p className="text-xs text-muted">{[person.title, person.role].filter(Boolean).join(" · ")}</p>}
        <Badge tone={person.type === "team" ? "blue" : "gray"} className="mt-1.5">
          {person.type === "team" ? "Team" : "Customer or partner"}
        </Badge>
        {person.bio && <p className="mt-2 line-clamp-4 text-xs text-muted">{person.bio}</p>}
      </div>
    </div>
  );
}

export function PeopleTab() {
  return (
    <div className="space-y-4">
      <SectionCard title="Team" subtitle="The people behind the business">
        <RecordList<Person>
          path="people"
          columns={3}
          fields={FIELDS}
          blank={blank("team")}
          filter={(p) => p.type === "team"}
          addLabel="team member"
          emptyText="We didn't find team members on the site. Add the faces of your business here."
          render={(p) => <PersonCard person={p} />}
        />
      </SectionCard>
      <SectionCard title="Customers and partners" subtitle="People quoted in testimonials or named as partners">
        <RecordList<Person>
          path="people"
          columns={3}
          fields={FIELDS}
          blank={blank("customer_partner")}
          filter={(p) => p.type === "customer_partner"}
          addLabel="customer or partner"
          emptyText="No customers or partners found yet."
          render={(p) => <PersonCard person={p} />}
        />
      </SectionCard>
    </div>
  );
}
