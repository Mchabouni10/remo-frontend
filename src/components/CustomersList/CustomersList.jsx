import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faEye,
  faEdit,
  faTrashAlt,
  faSort,
  faSortUp,
  faSortDown,
  faTimes,
  faPlusCircle,
  faExclamationTriangle,
  faCheckCircle,
  faUser,
  faAddressCard,
  faPhone,
  faTasks,
  faCalendarAlt,
  faDollarSign,
  faSpinner,
  faDownload,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';
import { getProjects, deleteProject } from '../../services/projectService';
import { calculateTotal } from '../Calculator/calculations/costCalculations';
import { formatPhoneNumber, formatDate } from '../Calculator/utils/customerhelper';
import styles from './CustomersList.module.css';

const DUE_SOON_DAYS = 7;
const OVERDUE_THRESHOLD = -1;
const ITEMS_PER_PAGE = 10;

export default function CustomersList() {
  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(true);
  const navigate = useNavigate();

  const projectTotals = useCallback((project) => {
    const totals = calculateTotal(
      project.categories || [],
      project.settings?.taxRate || 0,
      project.settings?.transportationFee || 0,
      project.settings?.wasteFactor || 0,
      project.settings?.miscFees || [],
      project.settings?.markup || 0
    );
    const grandTotal = totals.total || 0;
    const totalPaid = (project.settings?.payments || []).reduce(
      (sum, payment) => sum + (payment.isPaid ? payment.amount : 0),
      0
    ) + (project.settings?.deposit || 0);
    return {
      grandTotal,
      amountRemaining: Math.max(0, grandTotal - totalPaid),
    };
  }, []);

  const determineStatus = useCallback((projects) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let earliestStart = null;
    let latestFinish = null;
    let totalAmountRemaining = 0;

    projects.forEach((project) => {
      const startDate = project.customerInfo?.startDate ? new Date(project.customerInfo.startDate) : null;
      const finishDate = project.customerInfo?.finishDate ? new Date(project.customerInfo.finishDate) : null;
      const { amountRemaining } = projectTotals(project);

      if (startDate) earliestStart = earliestStart ? new Date(Math.min(earliestStart, startDate)) : startDate;
      if (finishDate) latestFinish = latestFinish ? new Date(Math.max(latestFinish, finishDate)) : finishDate;
      totalAmountRemaining += amountRemaining;
    });

    if (!earliestStart && !latestFinish) return 'Not Started';
    const daysToStart = earliestStart ? (earliestStart - today) / (1000 * 60 * 60 * 24) : Infinity;
    const daysToFinish = latestFinish ? (latestFinish - today) / (1000 * 60 * 60 * 24) : Infinity;

    if (daysToStart > DUE_SOON_DAYS) return 'Not Started';
    if (daysToStart <= DUE_SOON_DAYS && daysToStart > 0) return 'Starting Soon';
    if (daysToStart <= 0 && (daysToFinish > DUE_SOON_DAYS || !latestFinish)) return 'In Progress';
    if (daysToFinish <= DUE_SOON_DAYS && daysToFinish > OVERDUE_THRESHOLD) return 'Due Soon';
    if (daysToFinish <= OVERDUE_THRESHOLD && totalAmountRemaining > 0) return 'Overdue';
    if (daysToFinish <= OVERDUE_THRESHOLD && totalAmountRemaining === 0) return 'Completed';
    return 'In Progress';
  }, [projectTotals]);

  const groupAndSetCustomers = useCallback(
    (projectsList) => {
      const customerMap = projectsList.reduce((acc, project) => {
        const key = `${project.customerInfo?.firstName || ''}|${project.customerInfo?.lastName || ''}|${project.customerInfo?.phone || ''}`;
        if (!acc[key]) {
          acc[key] = {
            customerInfo: { ...project.customerInfo, projectName: null },
            projects: [],
            totalGrandTotal: 0,
            totalAmountRemaining: 0,
            earliestStartDate: null,
            latestFinishDate: null,
          };
        }
        acc[key].projects.push(project);
        const { grandTotal, amountRemaining } = projectTotals(project);
        acc[key].totalGrandTotal += grandTotal;
        acc[key].totalAmountRemaining += amountRemaining;

        const startDate = project.customerInfo?.startDate ? new Date(project.customerInfo.startDate) : null;
        const finishDate = project.customerInfo?.finishDate ? new Date(project.customerInfo.finishDate) : null;
        if (startDate) acc[key].earliestStartDate = acc[key].earliestStartDate ? new Date(Math.min(acc[key].earliestStartDate, startDate)) : startDate;
        if (finishDate) acc[key].latestFinishDate = acc[key].latestFinishDate ? new Date(Math.max(acc[key].latestFinishDate, finishDate)) : finishDate;

        acc[key].status = determineStatus(acc[key].projects);
        return acc;
      }, {});

      let customers = Object.values(customerMap);
      if (debouncedSearchQuery) {
        const queryLower = debouncedSearchQuery.toLowerCase().trim();
        const queryDigits = debouncedSearchQuery.replace(/\D/g, '');
        customers = customers.filter(
          (c) =>
            c.customerInfo.firstName?.toLowerCase().startsWith(queryLower) ||
            c.customerInfo.lastName?.toLowerCase().startsWith(queryLower) ||
            (queryDigits && c.customerInfo.phone?.replace(/\D/g, '').includes(queryDigits))
        );
      }

      if (sortConfig.key) {
        customers.sort((a, b) => {
          const [aValue, bValue] =
            sortConfig.key === 'lastName'
              ? [(a.customerInfo.lastName || '').toLowerCase(), (b.customerInfo.lastName || '').toLowerCase()]
              : sortConfig.key === 'startDate'
              ? [a.earliestStartDate?.getTime() || 0, b.earliestStartDate?.getTime() || 0]
              : [a.totalAmountRemaining, b.totalAmountRemaining];
          return (aValue < bValue ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
        });
      }

      return customers;
    },
    [debouncedSearchQuery, sortConfig, projectTotals, determineStatus]
  );

  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedProjects = await getProjects();
        setProjects(fetchedProjects);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError('Failed to load customers. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const filteredCustomers = useMemo(() => groupAndSetCustomers(projects), [projects, groupAndSetCustomers]);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  const totals = useMemo(
    () =>
      projects.reduce(
        (acc, project) => {
          const { grandTotal, amountRemaining } = projectTotals(project);
          acc.grandTotal += grandTotal;
          acc.amountRemaining += amountRemaining;
          return acc;
        },
        { grandTotal: 0, amountRemaining: 0 }
      ),
    [projects, projectTotals]
  );

  const notifications = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const AMOUNT_REMAINING_THRESHOLD = 5000; // Configurable threshold
    const notificationList = filteredCustomers.reduce((acc, customer) => {
      customer.projects.forEach((project) => {
        const startDate = project.customerInfo?.startDate ? new Date(project.customerInfo.startDate) : null;
        const finishDate = project.customerInfo?.finishDate ? new Date(project.customerInfo.finishDate) : null;
        if (startDate) {
          const daysToStart = (startDate - today) / (1000 * 60 * 60 * 24);
          if (daysToStart <= DUE_SOON_DAYS && daysToStart > 0) {
            acc.push({
              message: `${project.customerInfo.firstName} ${project.customerInfo.lastName}'s project is starting soon on ${startDate.toLocaleDateString()}.`,
              overdue: false,
            });
          }
        }
        if (finishDate) {
          const daysToFinish = (finishDate - today) / (1000 * 60 * 60 * 24);
          if (daysToFinish <= DUE_SOON_DAYS && daysToFinish > OVERDUE_THRESHOLD) {
            acc.push({
              message: `${project.customerInfo.firstName} ${project.customerInfo.lastName}'s project is due soon on ${finishDate.toLocaleDateString()}.`,
              overdue: false,
            });
          } else if (daysToFinish <= OVERDUE_THRESHOLD && projectTotals(project).amountRemaining > 0) {
            acc.push({
              message: `${project.customerInfo.firstName} ${project.customerInfo.lastName}'s project was due on ${finishDate.toLocaleDateString()} and is overdue.`,
              overdue: true,
            });
          }
        }
      });
      return acc;
    }, []);

    if (totals.amountRemaining > AMOUNT_REMAINING_THRESHOLD) {
      notificationList.push({
        message: `Total Amount Remaining across all projects exceeds $${AMOUNT_REMAINING_THRESHOLD.toLocaleString()}: $${totals.amountRemaining.toFixed(2)}.`,
        overdue: true,
      });
    }

    return notificationList;
  }, [filteredCustomers, projectTotals, totals.amountRemaining]);

  const handleSort = (key) =>
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));

  const handleDetails = (customerProjects) => navigate('/home/customer-projects', { state: { projects: customerProjects } });
  const handleEdit = (projectId) => navigate(`/home/edit/${projectId}`);
  const handleDelete = async (projectId) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject(projectId);
        setProjects((prev) => prev.filter((p) => p._id !== projectId));
        setLastUpdated(new Date());
        alert('Project deleted successfully!');
      } catch (err) {
        console.error('Error deleting project:', err);
        alert('Failed to delete project.');
      }
    }
  };
  const handleNewProjectForCustomer = (customerInfo) => navigate('/home/customer', { state: { customerInfo } });
  const handleSearchChange = (e) => setSearchQuery(e.target.value);
  const handleClearSearch = () => setSearchQuery('');
  const getSortIcon = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? faSortUp : faSortDown) : faSort);
  const toggleNotifications = () => setIsNotificationsOpen((prev) => !prev);

  const handleExportCSV = () => {
    const headers = [
      'First Name',
      'Last Name',
      'Phone Number',
      'Project Count',
      'Earliest Start Date',
      'Latest Finish Date',
      'Status',
      'Total Amount Remaining',
      'Total Grand Total',
    ];
    const rows = filteredCustomers.map((customer) => [
      customer.customerInfo.firstName || 'N/A',
      customer.customerInfo.lastName || 'N/A',
      formatPhoneNumber(customer.customerInfo.phone),
      customer.projects.length,
      customer.earliestStartDate ? new Date(customer.earliestStartDate).toLocaleDateString() : 'N/A',
      customer.latestFinishDate ? new Date(customer.latestFinishDate).toLocaleDateString() : 'N/A',
      customer.status,
      `$${customer.totalAmountRemaining.toFixed(2)}`,
      `$${customer.totalGrandTotal.toFixed(2)}`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <main className={styles.mainContent}>
      <div className={styles.container}>
        <h1 className={styles.title}>Customers</h1>
        <div className={styles.searchSection}>
          <div className={styles.searchWrapper}>
            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by name or phone..."
              className={styles.searchInput}
            />
            {searchQuery && (
              <button onClick={handleClearSearch} className={styles.clearButton} title="Clear Search">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>
        {notifications.length > 0 && (
          <div className={styles.notificationsSection}>
            <div className={styles.notificationsHeader} onClick={toggleNotifications}>
              <h3>
                Notifications <span className={styles.notificationCount}>({notifications.length})</span>
              </h3>
              <FontAwesomeIcon
                icon={isNotificationsOpen ? faChevronUp : faChevronDown}
                className={styles.toggleIcon}
              />
            </div>
            {isNotificationsOpen && (
              <ul>
                {notifications.map((note, index) => (
                  <li key={index} className={note.overdue ? styles.overdue : styles.nearDue}>
                    <FontAwesomeIcon icon={note.overdue ? faExclamationTriangle : faCheckCircle} /> {note.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {isLoading ? (
          <div className={styles.loading}>
            <FontAwesomeIcon icon={faSpinner} spin /> Loading customers...
          </div>
        ) : paginatedCustomers.length > 0 ? (
          <div className={styles.tableWrapper}>
            <div className={styles.tableHeaderActions}>
              <button onClick={handleExportCSV} className={styles.exportButton} title="Export as CSV">
                <FontAwesomeIcon icon={faDownload} /> Export
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <FontAwesomeIcon icon={faUser} /> First Name
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSort('lastName')}
                    className={styles.sortable}
                    aria-sort={sortConfig.key === 'lastName' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <FontAwesomeIcon icon={faAddressCard} /> Last Name <FontAwesomeIcon icon={getSortIcon('lastName')} />
                  </th>
                  <th scope="col">
                    <FontAwesomeIcon icon={faPhone} /> Phone Number
                  </th>
                  <th scope="col">
                    <FontAwesomeIcon icon={faTasks} /> Project Count
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSort('startDate')}
                    className={styles.sortable}
                    aria-sort={sortConfig.key === 'startDate' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <FontAwesomeIcon icon={faCalendarAlt} /> Earliest Start Date <FontAwesomeIcon icon={getSortIcon('startDate')} />
                  </th>
                  <th scope="col">
                    <FontAwesomeIcon icon={faCalendarAlt} /> Latest Finish Date
                  </th>
                  <th scope="col">Status</th>
                  <th
                    scope="col"
                    onClick={() => handleSort('amountRemaining')}
                    className={styles.sortable}
                    aria-sort={sortConfig.key === 'amountRemaining' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <FontAwesomeIcon icon={faDollarSign} /> Total Amount Remaining <FontAwesomeIcon icon={getSortIcon('amountRemaining')} />
                  </th>
                  <th scope="col">
                    <FontAwesomeIcon icon={faDollarSign} /> Total Grand Total
                  </th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => {
                  const hasMultipleProjects = customer.projects.length > 1;
                  return (
                    <tr key={`${customer.customerInfo.lastName}-${customer.customerInfo.phone}`}>
                      <th scope="row">{customer.customerInfo.firstName || 'N/A'}</th>
                      <td className={styles.firstName}>{customer.customerInfo.lastName || 'N/A'}</td>
                      <td title={formatPhoneNumber(customer.customerInfo.phone)}>
                        {formatPhoneNumber(customer.customerInfo.phone)}
                      </td>
                      <td>
                        <span>{customer.projects.length}</span>
                      </td>
                      <td>{customer.earliestStartDate ? new Date(customer.earliestStartDate).toLocaleDateString() : 'N/A'}</td>
                      <td>{customer.latestFinishDate ? new Date(customer.latestFinishDate).toLocaleDateString() : 'N/A'}</td>
                      <td>
                        <span className={`${styles.status} ${styles[customer.status.toLowerCase().replace(' ', '')]}`}>
                          {customer.status}
                        </span>
                      </td>
                      <td
                        className={`${styles.currency} ${customer.totalAmountRemaining > 0 ? styles.amountDue : styles.amountPaid}`}
                        title={`Deposit: $${customer.projects
                          .reduce((sum, p) => sum + (p.settings?.deposit || 0), 0)
                          .toFixed(2)}, Paid: $${customer.projects
                          .reduce((sum, p) => sum + (p.settings?.payments || []).reduce((acc, pay) => acc + (pay.isPaid ? pay.amount : 0), 0), 0)
                          .toFixed(2)}`}
                      >
                        ${customer.totalAmountRemaining.toFixed(2)}
                        <div className={styles.amountDetails}>
                          <span className={styles.dueDetail}>
                            Due: ${customer.totalAmountRemaining.toFixed(2)}
                          </span>
                          <span className={styles.paidDetail}>
                            Paid: $
                            {customer.projects
                              .reduce((sum, p) => sum + (p.settings?.deposit || 0) + (p.settings?.payments || []).reduce((acc, pay) => acc + (pay.isPaid ? pay.amount : 0), 0), 0)
                              .toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className={styles.grandTotal}>${customer.totalGrandTotal.toFixed(2)}</td>
                      <td className={styles.actions}>
                        <button
                          onClick={() => handleDetails(customer.projects)}
                          className={styles.actionButton}
                          aria-label="View customer project details"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        <button
                          onClick={() => handleEdit(customer.projects[0]._id)}
                          className={`${styles.actionButton} ${styles.editButton}`}
                          aria-label={hasMultipleProjects ? 'View details to edit specific project' : 'Edit project'}
                          disabled={hasMultipleProjects}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          onClick={() => handleNewProjectForCustomer(customer.customerInfo)}
                          className={`${styles.actionButton} ${styles.newProjectButton}`}
                          aria-label="Create new project for customer"
                        >
                          <FontAwesomeIcon icon={faPlusCircle} />
                        </button>
                        <button
                          onClick={() => handleDelete(customer.projects[0]._id)}
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          aria-label={hasMultipleProjects ? 'View details to delete specific project' : 'Delete project'}
                          disabled={hasMultipleProjects}
                        >
                          <FontAwesomeIcon icon={faTrashAlt} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
            <div className={styles.totalsSection}>
              <p>
                Total Grand Total: <span className={styles.grandTotal}>${totals.grandTotal.toFixed(2)}</span>
              </p>
              <p>
                Total Amount Remaining: <span className={styles.remaining}>${totals.amountRemaining.toFixed(2)}</span>
              </p>
              <p className={styles.lastUpdated}>Last Updated: {formatDate(lastUpdated)}</p>
            </div>
          </div>
        ) : (
          <p className={styles.noResults}>
            No customers found. Try adjusting your search or{' '}
            <button onClick={() => navigate('/home/customer')} className={styles.inlineButton}>
              add a new customer
            </button>.
          </p>
        )}
      </div>
    </main>
  );
}