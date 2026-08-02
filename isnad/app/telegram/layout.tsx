import "./telegram.css";

export default function TelegramLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="telegram-viewport">{children}</div>;
}
