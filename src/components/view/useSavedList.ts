"use client";

/*
  Loads the saved list for the current filters, plus (once per reload) every industry
  in use for the filter menu and the unfiltered total, which tells "nothing saved yet"
  apart from "no records match these filters".
*/
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeSummary } from "@/lib/db/types";
import { listKnowledge, type ApiError } from "@/lib/api/client";
import { toApiParams, type ListQuery } from "@/lib/view/filters";

export function useSavedList(view: ListQuery, reloadKey: number) {
  const [items, setItems] = useState<KnowledgeSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [industries, setIndustries] = useState<string[]>([]);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  // Only the newest request may update state (typing fast fires several)
  const latest = useRef(0);

  const { q, industry, score, date, sort } = view;
  const query = useMemo(() => ({ q, industry, score, date, sort }), [q, industry, score, date, sort]);

  useEffect(() => {
    const id = ++latest.current;
    setLoading(true);
    listKnowledge(toApiParams(query)).then((res) => {
      if (id !== latest.current) return;
      setLoading(false);
      if (res.error) return setError(res.error);
      setError(null);
      setItems(res.data.items);
    });
  }, [query, reloadKey]);

  useEffect(() => {
    listKnowledge({ limit: "100", sort: "industry_asc" }).then((res) => {
      if (res.error) return;
      setAllTotal(res.data.total);
      // Distinct, case-insensitive
      const seen = new Map<string, string>();
      for (const it of res.data.items) if (it.industry && !seen.has(it.industry.toLowerCase())) seen.set(it.industry.toLowerCase(), it.industry);
      setIndustries([...seen.values()]);
    });
  }, [reloadKey]);

  return { items, error, loading, industries, allTotal };
}
