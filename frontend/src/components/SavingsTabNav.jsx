import { NavLink } from "react-router-dom";
import "./SavingsTabNav.css";

const TABS = [
  { label: "Dashboard", to: "/dashboard/admin/ls-savings" },
  { label: "Savings Management", to: "/dashboard/admin/savings-management" },
  { label: "Savings Obligations", to: "/dashboard/admin/mandatory-savings" },
  { label: "Withdrawal", to: "/dashboard/admin/withdrawal-requests" },
];

export default function SavingsTabNav() {
  return (
    <div className="savings-tab-nav">
      {TABS.map(({ label, to }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => `savings-tab${isActive ? " savings-tab--active" : ""}`}
        >
          {label}
        </NavLink>
      ))}
    </div>
  );
}
