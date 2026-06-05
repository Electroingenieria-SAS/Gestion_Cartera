import "./globals.css";

// Metadatos: título de la pestaña + favicon (Next.js usa app/icon.png automáticamente).
export const metadata = {
  title: "Gestión de Cartera | Electroingeniería S.A.S.",
  description:
    "Plataforma inteligente de gestión de cartera y cobranzas para Electroingeniería S.A.S.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="page">
          {children}

          {/* Footer obligatorio en TODAS las páginas */}
          <footer className="footer">
            <div className="container footer-inner">
              <span className="credit">
                Construido para <strong>Electroingeniería S.A.S.</strong> — Desarrollado por{" "}
                <strong>Juan Camilo Montoya</strong>
              </span>
              <span className="credit">© {new Date().getFullYear()}</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
