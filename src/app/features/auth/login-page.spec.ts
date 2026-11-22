import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { UserResponse } from '../../core/api/api-models';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let element: HTMLElement;
  let loginResult: Subject<UserResponse>;
  const auth = { login: vi.fn() };

  beforeEach(async () => {
    loginResult = new Subject<UserResponse>();
    auth.login.mockReset().mockReturnValue(loginResult);
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    fixture = TestBed.createComponent(LoginPage);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  function type(selector: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  async function submit(): Promise<void> {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('shows field errors and does not call the API when the form is invalid', async () => {
    type('#login-email', 'not-an-email');
    await submit();

    expect(auth.login).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter a valid email address.');
    expect(element.textContent).toContain('Enter your password.');
    expect(element.querySelector('#login-email')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the server error message on failed sign-in', async () => {
    type('#login-email', 'me@example.com');
    type('#login-password', 'wrong-password');
    await submit();

    expect(auth.login).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'wrong-password',
    });
    loginResult.error(ApiError.fromProblem(401, { code: 'INVALID_CREDENTIALS' }));
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain(
      'Invalid email or password.',
    );
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('navigates to documents after signing in, ignoring unsafe return URLs', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentRef.setInput('returnUrl', '//evil.example.com');
    type('#login-email', 'me@example.com');
    type('#login-password', 'Correct-Horse-Battery-9');
    await submit();

    loginResult.next({ id: 'u', email: 'me@example.com', displayName: 'Me', createdAt: '' });
    loginResult.complete();

    expect(navigate).toHaveBeenCalledWith('/documents');
  });

  it('explains that an expired session needs a new sign-in', async () => {
    fixture.componentRef.setInput('reason', 'expired');
    await fixture.whenStable();

    expect(element.textContent).toContain('Your session has ended');
  });
});
