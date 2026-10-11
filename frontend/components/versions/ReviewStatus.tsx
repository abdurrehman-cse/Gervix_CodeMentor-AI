"use client";
import type { Submission } from "../../lib/versions/snapshots";
import "./versions.css";
type Props = { submission?: Submission; current: boolean; busy: string; disabled: boolean; onSubmit: (force?: boolean) => void; onHistory: () => void };
export default function ReviewStatus(props: Props) {
  return <div className="review-status"><span role="status">{props.busy ? `Review running${props.submission ? ` · v${props.submission.version}` : ""}` : props.submission ? props.current ? `Analysis current · v${props.submission.version}` : "Code changed · Analysis outdated" : "Working draft · Not reviewed"}</span><div className="inline-actions"><button disabled={props.disabled} onClick={() => props.onSubmit()}>Submit for Review</button><button disabled={props.disabled} onClick={() => props.onSubmit()}>Reanalyze Latest Code</button><button disabled={props.disabled} onClick={() => props.onSubmit(true)} title="Create a new version even when code is unchanged">Resubmit unchanged</button><button onClick={props.onHistory}>Version History</button></div></div>;
}
