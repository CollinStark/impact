import NavMenu from "./NavMenu";
import "./globals.css";

export const metadata = {
  title:
    "IMPACT - Integrative Metabolomics Platform for Analysis, Contextualization and Targeting",
  description:
    "IMPACT - Integrative Metabolomics Platform for Analysis, Contextualization and Targeting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavMenu />
        {children}
      </body>
    </html>
  );
}
