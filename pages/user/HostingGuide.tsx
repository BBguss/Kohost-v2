import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { BookOpen, CheckCircle2, Circle, ChevronDown, ChevronRight, ArrowRight, Upload, Database, Globe, FolderCog, Zap, PartyPopper } from 'lucide-react';

interface GuideStep {
    id: string;
    title: string;
    description: string;
    icon: any;
    actionLabel?: string;
    actionView?: string;
    tasks: { id: string; label: string }[];
}

interface HostingGuideProps {
    onNavigate: (view: string) => void;
}

const STEPS: GuideStep[] = [
    {
        id: 'step_deploy',
        title: 'Deploy Your First App',
        description: 'Get your website running by uploading your source code.',
        icon: Upload,
        actionLabel: 'Go to Create Site',
        actionView: 'CREATE_SITE',
        tasks: [
            { id: 't1', label: 'Compress your project folder into a .zip file' },
            { id: 't2', label: 'Go to "New Site" menu' },
            { id: 't3', label: 'Select your framework (Laravel, React, etc.)' },
            { id: 't4', label: 'Upload the .zip and click Deploy' }
        ]
    },
    {
        id: 'step_db',
        title: 'Setup Database',
        description: 'Create a MySQL database and connect it to your application.',
        icon: Database,
        actionLabel: 'Manage Databases',
        actionView: 'DATABASE',
        tasks: [
            { id: 't5', label: 'Go to "Databases" menu' },
            { id: 't6', label: 'Click "New Database" and attach it to your site' },
            { id: 't7', label: 'Copy the "Master Credentials" (Host, User, Pass)' },
            { id: 't8', label: 'Update your project env with these credentials' }
        ]
    },
    {
        id: 'step_files',
        title: 'Configuration & Files',
        description: 'Manage your environment variables and files directly.',
        icon: FolderCog,
        actionLabel: 'Open File Manager',
        actionView: 'FILES',
        tasks: [
            { id: 't9', label: 'Go to "File Manager"' },
            { id: 't10', label: 'Locate your .env or config file' },
            { id: 't11', label: 'Right-click and select "Edit" to paste DB credentials' },
            { id: 't12', label: 'Save changes' }
        ]
    },
    {
        id: 'step_domain',
        title: 'Domain & Access',
        description: 'Access your site publicly via the configured domain.',
        icon: Globe,
        actionLabel: 'View Dashboard',
        actionView: 'DASHBOARD',
        tasks: [
            { id: 't13', label: 'Check the "Dashboard" for your Site URL' },
            { id: 't14', label: 'Ensure your status is "Active"' },
            { id: 't15', label: 'Click the URL to visit your live site' }
        ]
    }
];

export const HostingGuide: React.FC<HostingGuideProps> = ({ onNavigate }) => {
    const [completedTasks, setCompletedTasks] = useState<string[]>([]);
    const [expandedStep, setExpandedStep] = useState<string | null>('step_deploy');

    // Load progress from local storage
    useEffect(() => {
        const saved = localStorage.getItem('kp_guide_progress');
        if (saved) {
            setCompletedTasks(JSON.parse(saved));
        }
    }, []);

    // Save progress
    const toggleTask = (taskId: string) => {
        const newCompleted = completedTasks.includes(taskId)
            ? completedTasks.filter(id => id !== taskId)
            : [...completedTasks, taskId];
        
        setCompletedTasks(newCompleted);
        localStorage.setItem('kp_guide_progress', JSON.stringify(newCompleted));
    };

    const totalTasks = STEPS.reduce((acc, step) => acc + step.tasks.length, 0);
    const progress = Math.round((completedTasks.length / totalTasks) * 100);
    const isComplete = progress === 100;

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-300 space-y-8 pb-10">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BookOpen className="w-48 h-48" />
                </div>
                <div className="relative z-10">
                    <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                        {isComplete ? <PartyPopper className="w-8 h-8 text-yellow-300 animate-bounce" /> : <BookOpen className="w-8 h-8" />}
                        {isComplete ? 'Congratulations! You are a Pro.' : 'Hosting Starter Guide'}
                    </h1>
                    <p className="text-indigo-100 max-w-xl mb-6">
                        {isComplete 
                            ? "You've completed all the steps. Your application should be up and running perfectly!" 
                            : "Follow this interactive checklist to deploy your first website from zero to hero."}
                    </p>

                    {/* Progress Bar */}
                    <div className="bg-black/20 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                        <div className="flex justify-between items-center text-sm font-medium mb-2">
                            <span>Your Progress</span>
                            <span className="font-bold">{progress}% Completed</span>
                        </div>
                        <div className="w-full bg-black/20 h-3 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-700 ease-out relative"
                                style={{ width: `${progress}%` }}
                            >
                                {progress > 0 && <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 animate-pulse"></div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Steps Accordion */}
            <div className="space-y-4">
                {STEPS.map((step, idx) => {
                    const isExpanded = expandedStep === step.id;
                    const stepCompletedCount = step.tasks.filter(t => completedTasks.includes(t.id)).length;
                    const isStepFinished = stepCompletedCount === step.tasks.length;

                    return (
                        <div 
                            key={step.id} 
                            className={`border rounded-xl transition-all duration-300 overflow-hidden ${
                                isExpanded ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'bg-white border-slate-200 hover:border-indigo-300'
                            }`}
                        >
                            {/* Step Header */}
                            <div 
                                className="p-5 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                        isStepFinished ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                                    }`}>
                                        {isStepFinished ? <CheckCircle2 className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className={`font-bold text-lg ${isStepFinished ? 'text-slate-800' : 'text-slate-900'}`}>
                                            {idx + 1}. {step.title}
                                        </h3>
                                        <p className="text-sm text-slate-500">{step.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded">
                                        {stepCompletedCount}/{step.tasks.length}
                                    </span>
                                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                                </div>
                            </div>

                            {/* Step Content */}
                            {isExpanded && (
                                <div className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2">
                                    <div className="border-t border-slate-100 my-3"></div>
                                    
                                    <div className="space-y-3 pl-2">
                                        {step.tasks.map(task => {
                                            const isChecked = completedTasks.includes(task.id);
                                            return (
                                                <div 
                                                    key={task.id} 
                                                    onClick={() => toggleTask(task.id)}
                                                    className="flex items-start gap-3 cursor-pointer group select-none"
                                                >
                                                    <div className={`mt-0.5 transition-colors ${isChecked ? 'text-emerald-500' : 'text-slate-300 group-hover:text-indigo-400'}`}>
                                                        {isChecked ? <CheckCircle2 className="w-5 h-5 fill-emerald-50" /> : <Circle className="w-5 h-5" />}
                                                    </div>
                                                    <span className={`text-sm transition-colors ${isChecked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                        {task.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {step.actionLabel && step.actionView && (
                                        <div className="mt-6 pl-10">
                                            <button 
                                                onClick={() => onNavigate(step.actionView!)}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                                            >
                                                {step.actionLabel} <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-center text-slate-500 text-sm border border-slate-200 border-dashed">
                Need more help? Visit our <button onClick={() => onNavigate('SUPPORT')} className="text-indigo-600 font-bold hover:underline">Support Center</button> to open a ticket.
            </div>
        </div>
    );
};
