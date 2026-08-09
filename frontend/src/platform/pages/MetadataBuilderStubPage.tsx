/**
 * @deprecated All builders are implemented. This page is retained only to avoid broken imports.
 */
import { Link } from "react-router-dom";

export default function MetadataBuilderStubPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="font-medium">This stub has been replaced.</p>
      <p className="mt-2 text-sm text-slate-600">Use the Metadata Platform navigation for the full builders.</p>
      <Link to="/app/metadata" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
        Back to overview
      </Link>
    </div>
  );
}
