import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AsyncContent } from './async-content';

describe('AsyncContent', () => {
  describe('simple variant (children as ReactNode)', () => {
    it('shows spinner when loading', () => {
      const { container } = render(
        <AsyncContent loading={true}>
          <p>Content</p>
        </AsyncContent>,
      );
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('shows children when not loading and not empty', () => {
      render(
        <AsyncContent loading={false}>
          <p>Content</p>
        </AsyncContent>,
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('shows empty state when empty and not loading', () => {
      render(
        <AsyncContent loading={false} empty={true} emptyState={<p>No items</p>}>
          <p>Content</p>
        </AsyncContent>,
      );
      expect(screen.getByText('No items')).toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('shows spinner over empty state when loading', () => {
      const { container } = render(
        <AsyncContent loading={true} empty={true} emptyState={<p>No items</p>}>
          <p>Content</p>
        </AsyncContent>,
      );
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByText('No items')).not.toBeInTheDocument();
    });

    it('shows children when empty but no emptyState provided', () => {
      render(
        <AsyncContent loading={false} empty={true}>
          <p>Content</p>
        </AsyncContent>,
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('data variant (children as render function)', () => {
    interface TestData {
      name: string;
      items: string[];
    }

    const testData: TestData = { name: 'Test', items: ['a', 'b'] };

    it('shows spinner when loading', () => {
      const { container } = render(
        <AsyncContent loading={true} data={undefined as TestData | undefined}>
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('calls render function with data when loaded', () => {
      render(
        <AsyncContent loading={false} data={testData}>
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('shows empty state when data is null', () => {
      render(
        <AsyncContent
          loading={false}
          data={null as TestData | null}
          emptyState={<p>No data</p>}
        >
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(screen.getByText('No data')).toBeInTheDocument();
    });

    it('shows empty state with boolean empty check', () => {
      const emptyData: TestData = { name: 'Empty', items: [] };
      render(
        <AsyncContent
          loading={false}
          data={emptyData}
          empty={emptyData.items.length === 0}
          emptyState={<p>No items</p>}
        >
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('shows empty state with predicate empty check', () => {
      const emptyData: TestData = { name: 'Empty', items: [] };
      render(
        <AsyncContent
          loading={false}
          data={emptyData}
          empty={(d) => d.items.length === 0}
          emptyState={<p>No items</p>}
        >
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('renders content when predicate returns false', () => {
      render(
        <AsyncContent
          loading={false}
          data={testData}
          empty={(d) => d.items.length === 0}
          emptyState={<p>No items</p>}
        >
          {(data) => <p>{data.items.join(', ')}</p>}
        </AsyncContent>,
      );
      expect(screen.getByText('a, b')).toBeInTheDocument();
    });

    it('returns null when data is undefined and no emptyState', () => {
      const { container } = render(
        <AsyncContent loading={false} data={undefined as TestData | undefined}>
          {(data) => <p>{data.name}</p>}
        </AsyncContent>,
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
