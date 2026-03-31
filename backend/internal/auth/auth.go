package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	cookieName  = "beaver_session"
	tokenExpiry = 30 * 24 * time.Hour // 30 days
)

// Auth handles password verification and JWT session management.
type Auth struct {
	password    string
	jwtSecret   []byte
	passVersion string // hash of password, embedded in JWT to invalidate sessions on password change
	secure      bool   // set cookie Secure flag (true for HTTPS)
}

// New creates a new Auth instance.
// password is the plaintext password from AUTH_PASSWORD env.
// jwtSecret is the secret key for signing JWT tokens.
// secure determines whether cookies require HTTPS.
func New(password, jwtSecret string, secure bool) *Auth {
	h := sha256.Sum256([]byte(password))
	return &Auth{
		password:    password,
		jwtSecret:   []byte(jwtSecret),
		passVersion: hex.EncodeToString(h[:8]),
		secure:      secure,
	}
}

// CheckPassword performs a constant-time comparison of the provided password.
func (a *Auth) CheckPassword(input string) bool {
	return subtle.ConstantTimeCompare([]byte(input), []byte(a.password)) == 1
}

// CreateToken generates a JWT token and sets it as an HttpOnly cookie.
func (a *Auth) CreateToken(w http.ResponseWriter) error {
	now := time.Now()
	claims := jwt.MapClaims{
		"iat": now.Unix(),
		"exp": now.Add(tokenExpiry).Unix(),
		"pv":  a.passVersion, // password version - changes when password changes
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(a.jwtSecret)
	if err != nil {
		return fmt.Errorf("sign token: %w", err)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    signed,
		Path:     "/",
		MaxAge:   int(tokenExpiry.Seconds()),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteStrictMode,
	})
	return nil
}

// ValidateRequest checks the JWT cookie on the request.
// Returns nil if valid, error otherwise.
func (a *Auth) ValidateRequest(r *http.Request) error {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return fmt.Errorf("no session cookie")
	}

	token, err := jwt.Parse(cookie.Value, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return a.jwtSecret, nil
	})
	if err != nil {
		return fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return fmt.Errorf("invalid claims")
	}

	// Check password version - if password changed in .env, old tokens are invalid
	pv, _ := claims["pv"].(string)
	if pv != a.passVersion {
		return fmt.Errorf("password changed, session invalidated")
	}

	return nil
}

// ClearSession removes the session cookie.
func (a *Auth) ClearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteStrictMode,
	})
}
