import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { RegisterPage } from './register-page';

describe('RegisterPage', () => {
  const auth = { register: vi.fn() };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const type = (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { element, type, submit };
  }

  it('requires a 12-character password before calling the API', async () => {
    const { element, type, submit } = await setup();
    type('#register-name', 'Me');
    type('#register-email', 'me@example.com');
    type('#register-password', 'short');
    await submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use 12 to 128 characters.');
  });

  it('shows server field errors next to the right field', async () => {
    auth.register.mockReturnValue(
      throwError(() =>
        ApiError.fromProblem(400, {
          code: 'VALIDATION_FAILED',
          errors: [
            { field: 'password', message: 'This password is too common. Choose another one.' },
          ],
        }),
      ),
    );
    const { element, type, submit } = await setup();
    type('#register-name', 'Me');
    type('#register-email', 'me@example.com');
    type('#register-password', 'password1234');
    await submit();

    expect(element.querySelector('#register-password-error')!.textContent).toContain('too common');
  });

  it('shows non-field errors such as an existing email', async () => {
    auth.register.mockReturnValue(
      throwError(() =>
        ApiError.fromProblem(409, {
          code: 'EMAIL_ALREADY_REGISTERED',
          detail: 'An account with this email already exists.',
        }),
      ),
    );
    const { element, type, submit } = await setup();
    type('#register-name', 'Me');
    type('#register-email', 'taken@example.com');
    type('#register-password', 'Correct-Horse-Battery-9');
    await submit();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain('already exists');
  });
});
