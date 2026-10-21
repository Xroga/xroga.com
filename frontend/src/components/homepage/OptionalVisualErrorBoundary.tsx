'use client';

import { Component, type ReactNode } from 'react';

/** Optional decorative effects may fail without taking down the public homepage. */
export class OptionalVisualErrorBoundary extends Component<
  {children: ReactNode},
  {failed:boolean}
> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error: Error){console.error('[OptionalVisualErrorBoundary]',error);}
  render(){return this.state.failed?null:this.props.children;}
}
