'use client';
import { Component, type ReactNode } from 'react';
import ResponseCanvasV2 from './ResponseCanvasV2';
import { readRichShareSnapshot } from './shareSnapshot';

class SharePresentationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Share ACL and rollout are checked on the server before this component mounts.
 * No Workspace execution controls or persistent account interaction scope exist here. */
export default function SharedResponseV2({ snapshot, text, openUi = false }: { snapshot: string; text: string; openUi?: boolean }) {
  const result = readRichShareSnapshot(snapshot);
  const fallback = <p className="whitespace-pre-wrap text-[15px] leading-7">{text}</p>;
  return result.document ? <SharePresentationBoundary fallback={fallback}><ResponseCanvasV2 document={result.document} openUi={openUi} /></SharePresentationBoundary> : fallback;
}
