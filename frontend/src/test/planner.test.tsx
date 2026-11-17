import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlannerPage } from '../features/planner/PlannerPage';

describe('Personalized Action Planner Interactions', () => {
  it('renders daily action slots and allows toggling policy mode', () => {
    render(<PlannerPage />);

    expect(screen.getByText('Personalized Daily Action Planner')).toBeInTheDocument();

    const maxProtectionBtn = screen.getByRole('button', { name: /Max Personal Protection/i });
    expect(maxProtectionBtn).toBeInTheDocument();

    fireEvent.click(maxProtectionBtn);
    expect(maxProtectionBtn).toHaveClass('text-slate-900', 'dark:text-white');
  });

  it('allows recording helpful/unfeasible feedback on action slots', () => {
    render(<PlannerPage />);

    const helpfulButtons = screen.getAllByRole('button', { name: /Helpful/i });
    expect(helpfulButtons.length).toBeGreaterThan(0);

    // Click the first slot's Helpful button
    fireEvent.click(helpfulButtons[0]);
    expect(helpfulButtons[0]).toHaveClass('bg-emerald-100');
  });

  it('clearly identifies simulated context in the planner header', () => {
    render(<PlannerPage />);
    expect(screen.getByText(/Illustrative AI Plan \(Demo\)/i)).toBeInTheDocument();
  });
});
