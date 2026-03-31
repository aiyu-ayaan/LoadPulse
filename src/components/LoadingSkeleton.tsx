interface LoadingSkeletonProps {
    className?: string;
}

export const LoadingSkeleton = ({ className = '' }: LoadingSkeletonProps) => {
    return <div aria-hidden className={`loading-skeleton ${className}`} />;
};
