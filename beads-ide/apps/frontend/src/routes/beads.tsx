import { createFileRoute } from "@tanstack/react-router";
import { BeadList } from "../components/beads/bead-list";
import { useBeadSelection } from "../contexts";

export const Route = createFileRoute("/beads")({
  component: BeadsPage,
});

function BeadsPage() {
  const { selectBead } = useBeadSelection();

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <BeadList onBeadClick={selectBead} />
    </div>
  );
}
