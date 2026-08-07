const REMOVABLE_SUFFIX_WORDS = new Set([
  "pvt",
  "ltd",
  "limited",
  "inc",
  "llc",
  "corp",
  "company",
  "services",
  "energy",
  "india",
  "private",
]);

/** User-editable company short-name suggestion for client creation. */
export function suggestCompanyShortName(officialName: string): string {
  const words = officialName
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
  if (words.length === 0) return "";

  const significant = [...words];
  while (
    significant.length > 1 &&
    REMOVABLE_SUFFIX_WORDS.has(significant[significant.length - 1].toLowerCase())
  ) {
    significant.pop();
  }
  if (significant.length === 0) return words[0];

  const acronymWords =
    significant.length === 2 && words.length >= 3 && words[2]?.toLowerCase() === "services"
      ? [...significant, words[2]]
      : significant;
  if (acronymWords.length >= 2 && acronymWords.every((word) => word.length >= 4)) {
    return acronymWords.map((word) => word[0].toUpperCase()).join("");
  }

  return significant[0];
}
