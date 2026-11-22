import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root of DocuLens — AI Document Intelligence. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
