import { Component, computed, input } from '@angular/core';
import { Citation } from '../core/api/api-models';
import { PagesPipe } from './formatting';

/**
 * Sources of an answer. Cited sources come first; others are listed as "also considered". Snippets are untrusted
 * document text and are rendered with text interpolation only (never as HTML).
 */
@Component({
  selector: 'dl-citation-list',
  imports: [PagesPipe],
  template: `
    @if (citations().length > 0) {
      <section class="citations" [attr.aria-label]="'Sources for this answer'">
        <h3 class="citations__title">Sources</h3>
        <ol class="citations__list">
          @for (citation of ordered(); track citation.label) {
            <li class="citation" [class.citation--uncited]="!citation.cited">
              <details>
                <summary>
                  <span class="citation__label">[{{ citation.label }}]</span>
                  <span class="citation__doc">{{ citation.documentName }}</span>
                  <span class="citation__pages">{{ citation | pages }}</span>
                  @if (!citation.cited) {
                    <span class="citation__note">also considered</span>
                  }
                  @if (citation.documentId === null) {
                    <span class="citation__note">document deleted</span>
                  }
                </summary>
                @if (citation.snippet) {
                  <blockquote class="citation__snippet">{{ citation.snippet }}</blockquote>
                } @else {
                  <p class="citation__snippet citation__snippet--missing">
                    The quoted text is no longer available.
                  </p>
                }
              </details>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class CitationList {
  readonly citations = input.required<Citation[]>();

  protected readonly ordered = computed(() =>
    [...this.citations()].sort((a, b) => Number(b.cited) - Number(a.cited)),
  );
}
