import { useState } from 'react'
import { BackIcon, LeafIcon } from './icons'
import { login, register, setCurrentUser } from './api'
import './Auth.css'

// 로그인/가입 실패 시 백엔드가 영어로 내려주는 detail 메시지를 화면 문구로 매칭한다.
const ERROR_MESSAGES = {
  'Invalid email or password': '이메일 또는 비밀번호가 일치하지 않아요.',
  'Email already registered': '이미 가입된 이메일이에요.',
}

function translateError(message) {
  return ERROR_MESSAGES[message] || message
}

function Auth({ onNavigate, initialSub }) {
  const [screen, setScreen] = useState(initialSub || 'start') // 'start' | 'login' | 'signup' | 'find_password'
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    remember: true,
    terms: false,
  })
  const [findEmail, setFindEmail] = useState('')
  const [isEmailSent, setIsEmailSent] = useState(false)
  const [showResendMessage, setShowResendMessage] = useState(false)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState({ show: false, message: '' })
  const [submitting, setSubmitting] = useState(false)

  const emailOk = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target
    const v = type === 'checkbox' ? checked : value
    setForm((prev) => ({ ...prev, [name]: v }))
    setErrors((prev) => ({ ...prev, [name]: '', form: '' }))
  }

  const handleBack = () => {
    setScreen('start')
    setErrors({})
  }

  const handleGoLogin = () => {
    setScreen('login')
    setErrors({})
    setForm((prev) => ({ ...prev, email: '', password: '' }))
  }

  const handleGoSignup = () => {
    setScreen('signup')
    setErrors({})
    setForm({ name: '', email: '', password: '', confirm: '', remember: true, terms: false })
  }

  const handleGoFindPassword = () => {
    setScreen('find_password')
    setFindEmail('')
    setIsEmailSent(false)
    setShowResendMessage(false)
    setErrors({})
  }

  const handleResend = () => {
    setShowResendMessage(true)
    setTimeout(() => setShowResendMessage(false), 3000)
  }

  const showSuccessToast = (message, after) => {
    setToast({ show: true, message })
    setTimeout(() => {
      setToast({ show: false, message: '' })
      after?.()
    }, 1400)
  }

  const doLogin = async (e) => {
    e.preventDefault()
    const errs = {}
    const email = form.email.trim().toLowerCase()

    if (!form.email) errs.email = '이메일을 입력해 주세요.'
    else if (!emailOk(email)) errs.email = '올바른 이메일 형식이 아니에요.'
    if (!form.password) errs.password = '비밀번호를 입력해 주세요.'
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    try {
      const res = await login(email, form.password)
      setCurrentUser(res.user)
      showSuccessToast(`${res.user.nickname}님, 성공적으로 로그인되었습니다!`, () => onNavigate('profile'))
    } catch (err) {
      setErrors({ form: translateError(err.message) })
    } finally {
      setSubmitting(false)
    }
  }

  const doSignup = async (e) => {
    e.preventDefault()
    const errs = {}
    const email = form.email.trim().toLowerCase()

    if (!form.name.trim()) errs.name = '닉네임을 입력해 주세요.'
    if (!form.email) errs.email = '이메일을 입력해 주세요.'
    else if (!emailOk(email)) errs.email = '올바른 이메일 형식이 아니에요.'
    if (!form.password) errs.password = '비밀번호를 입력해 주세요.'
    else if (form.password.length < 4) errs.password = '비밀번호는 4자 이상이어야 해요.'
    if (form.confirm !== form.password) errs.confirm = '비밀번호가 일치하지 않아요.'
    if (!form.terms) errs.terms = '약관에 동의해 주세요.'
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    try {
      const res = await register(email, form.password, form.name.trim())
      setCurrentUser(res.user)
      showSuccessToast('회원가입이 성공적으로 완료되었습니다!', () => onNavigate('profile'))
    } catch (err) {
      setErrors({ form: translateError(err.message) })
    } finally {
      setSubmitting(false)
    }
  }

  const doFindPassword = (e) => {
    e.preventDefault()
    // 실제 메일 발송 기능은 아직 없어 화면 흐름만 보여준다.
    if (!findEmail) {
      setErrors({ email: '이메일을 입력해 주세요.' })
      return
    }
    if (!emailOk(findEmail.trim().toLowerCase())) {
      setErrors({ email: '올바른 이메일 형식이 아니에요.' })
      return
    }
    setIsEmailSent(true)
    setShowResendMessage(false)
    setErrors({})
  }

  const getScreenClass = (targetScreen) => {
    const order = { start: 0, login: 1, find_password: 2, signup: 3 }
    const currentIndex = order[screen]
    const targetIndex = order[targetScreen]
    const layoutClass = targetScreen === 'start' ? 'start-screen' : 'form-screen'

    if (currentIndex === targetIndex) return `auth-screen ${layoutClass} active`
    if (currentIndex > targetIndex) return `auth-screen ${layoutClass} slide-left`
    return `auth-screen ${layoutClass} slide-right`
  }

  return (
    <div className="auth-container">
      {toast.show && (
        <div className="success-toast">
          <span>✓</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className={getScreenClass('start')}>
        <div className="brand-logo-container">
          <span className="brand-f">f</span>
          <span className="brand-icon">
            <LeafIcon size={20} />
          </span>
          <span className="brand-text">restudy</span>
        </div>

        <div className="avatar-circle">
          <LeafIcon size={64} />
        </div>

        <h1 className="landing-title">
          매일 조금씩,
          <br />
          함께 자라는 학습
        </h1>
        <p className="landing-desc">레벨을 올리고 도토리를 모으며, 목표를 향해 꾸준히 달려봐요.</p>

        <div className="btn-group">
          <button type="button" className="btn btn-primary" onClick={handleGoLogin}>
            로그인
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleGoSignup}>
            회원가입
          </button>
        </div>
      </div>

      <div className={getScreenClass('login')}>
        <button type="button" className="auth-back-btn" onClick={handleBack} aria-label="뒤로가기">
          <BackIcon size={22} />
        </button>

        <h2 className="screen-title">로그인</h2>
        <p className="screen-desc">다시 만나 반갑습니다. 계정 정보를 입력해 주세요.</p>

        <form onSubmit={doLogin}>
          <div className="input-group">
            <label className="input-label">이메일</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={`input-field ${errors.email ? 'has-error' : ''}`}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <div className="input-group">
            <label className="input-label">비밀번호</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="비밀번호"
              className={`input-field ${errors.password ? 'has-error' : ''}`}
            />
            {errors.password && <p className="error-text">{errors.password}</p>}
          </div>

          <div className="flex-row justify-between remember-row">
            <label className="checkbox-label">
              <input
                name="remember"
                type="checkbox"
                checked={form.remember}
                onChange={handleChange}
                className="checkbox-input"
              />
              로그인 상태 유지
            </label>
            <span className="find-password-link" onClick={handleGoFindPassword}>
              비밀번호 찾기
            </span>
          </div>

          {errors.form && (
            <div className="form-error-box">
              <p className="form-error-text">{errors.form}</p>
            </div>
          )}

          <button type="submit" className="btn btn-primary submit-btn" disabled={submitting}>
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="auth-footer-text">
          아직 회원이 아니신가요? <span className="auth-link" onClick={handleGoSignup}>회원가입</span>
        </p>
      </div>

      <div className={getScreenClass('signup')}>
        <button type="button" className="auth-back-btn" onClick={handleBack} aria-label="뒤로가기">
          <BackIcon size={22} />
        </button>

        <h2 className="screen-title">회원가입</h2>
        <p className="screen-desc">forestudy와 함께 학습 여정을 시작해요.</p>

        <form onSubmit={doSignup}>
          <div className="input-group">
            <label className="input-label">닉네임</label>
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="사용하실 닉네임"
              className={`input-field ${errors.name ? 'has-error' : ''}`}
            />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>

          <div className="input-group">
            <label className="input-label">이메일</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={`input-field ${errors.email ? 'has-error' : ''}`}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <div className="input-group">
            <label className="input-label">비밀번호</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="4자 이상"
              className={`input-field ${errors.password ? 'has-error' : ''}`}
            />
            {errors.password && <p className="error-text">{errors.password}</p>}
          </div>

          <div className="input-group">
            <label className="input-label">비밀번호 확인</label>
            <input
              name="confirm"
              type="password"
              value={form.confirm}
              onChange={handleChange}
              placeholder="비밀번호 재입력"
              className={`input-field ${errors.confirm ? 'has-error' : ''}`}
            />
            {errors.confirm && <p className="error-text">{errors.confirm}</p>}
          </div>

          <div className="terms-row">
            <label className="checkbox-label align-start">
              <input
                name="terms"
                type="checkbox"
                checked={form.terms}
                onChange={handleChange}
                className="checkbox-input"
              />
              이용약관 및 개인정보 처리방침에 동의합니다.
            </label>
            {errors.terms && <p className="error-text mt-6">{errors.terms}</p>}
          </div>

          {errors.form && (
            <div className="form-error-box">
              <p className="form-error-text">{errors.form}</p>
            </div>
          )}

          <button type="submit" className="btn btn-primary submit-btn" disabled={submitting}>
            {submitting ? '가입 처리 중...' : '가입하고 시작하기'}
          </button>
        </form>

        <p className="auth-footer-text">
          이미 계정이 있으신가요? <span className="auth-link" onClick={handleGoLogin}>로그인</span>
        </p>
      </div>

      <div className={getScreenClass('find_password')}>
        <button type="button" className="auth-back-btn" onClick={handleGoLogin} aria-label="뒤로가기">
          <BackIcon size={22} />
        </button>

        <h2 className="screen-title">비밀번호 찾기</h2>
        <p className="screen-desc">가입하신 이메일 주소를 입력해주시면 해당 계정으로 인증 메일이 발송됩니다.</p>

        {!isEmailSent ? (
          <form onSubmit={doFindPassword}>
            <div className="input-group">
              <label className="input-label">이메일</label>
              <input
                type="email"
                value={findEmail}
                onChange={(e) => {
                  setFindEmail(e.target.value)
                  setErrors({})
                }}
                placeholder="you@example.com"
                className={`input-field ${errors.email ? 'has-error' : ''}`}
              />
              {errors.email && <p className="error-text">{errors.email}</p>}
            </div>

            {errors.form && (
              <div className="form-error-box">
                <p className="form-error-text">{errors.form}</p>
              </div>
            )}

            <button type="submit" className="btn btn-primary submit-btn">
              비밀번호 찾기
            </button>
          </form>
        ) : (
          <div className="recovered-box">
            <div className="recovered-check-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-text)' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="recovered-title">인증 메일을 전송했습니다</p>

            <p className="recovered-desc-sent">
              <strong>{findEmail}</strong> 계정으로
              <br />
              본인확인 인증 메일이 발송되었습니다.
              <br />
              메일함의 링크를 통해 비밀번호 재설정을 완료해 주세요.
            </p>

            <div className="resend-section">
              <span>메일이 오지 않았나요?</span>
              <button type="button" className="resend-link-btn" onClick={handleResend}>
                재전송하기
              </button>
            </div>

            {showResendMessage && <div className="resend-toast">인증 메일이 재발송되었습니다.</div>}

            <button type="button" className="btn btn-primary submit-btn" onClick={handleGoLogin}>
              로그인 화면으로
            </button>
          </div>
        )}

        <p className="auth-footer-text">
          로그인 화면으로 돌아가시겠어요? <span className="auth-link" onClick={handleGoLogin}>로그인</span>
        </p>
      </div>
    </div>
  )
}

export default Auth
