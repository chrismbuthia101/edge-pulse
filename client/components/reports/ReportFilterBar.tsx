"use client";

import { Calendar, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ReportFilterBarProps {
    dateRange: string;
    onDateRangeChange: (value: string) => void;
    filters?: Array<{
        value: string;
        onChange: (value: string) => void;
        placeholder: string;
        options: Array<{ value: string; label: string }>;
    }>;
}

export function ReportFilterBar({ dateRange, onDateRangeChange, filters = [] }: ReportFilterBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={dateRange} onValueChange={onDateRangeChange}>
                    <SelectTrigger className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1d">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {filters.map((filter, index) => (
                <div key={index} className="flex items-center gap-2">
                    {index === 0 && <Filter className="h-4 w-4 text-muted-foreground" />}
                    <Select value={filter.value} onValueChange={filter.onChange}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder={filter.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                            {filter.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ))}
        </div>
    );
}
