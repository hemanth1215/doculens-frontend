import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorAlert } from '../../shared/error-alert';

type Field = 'email' | 'password' | 'displayName';

@Component({
  selector: 'dl-register-page',
  imports: [ReactiveFormsModule, RouterLink, ErrorAlert],
  templateUrl: './register-page.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Matches RegisterRequest in the contract. */
  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(/.*\S.*/)],
    ],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverFieldErrors = signal<Partial<Record<Field, string>>>({});

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.serverFieldErrors.set({});
    const { displayName, email, password } = this.form.getRawValue();
    this.auth.register({ displayName: displayName.trim(), email, password }).subscribe({
      next: () => void this.router.navigateByUrl('/documents'),
      error: (failure: unknown) => {
        this.submitting.set(false);
        const apiError = ApiError.from(failure);
        const fields = apiError.fieldErrors as Partial<Record<Field, string>>;
        this.serverFieldErrors.set(fields);
        if (Object.keys(fields).length === 0) {
          this.error.set(apiError.message);
        }
      },
    });
  }

  protected showError(field: Field): boolean {
    const control = this.form.controls[field];
    return (control.touched && control.invalid) || !!this.serverFieldErrors()[field];
  }
}
