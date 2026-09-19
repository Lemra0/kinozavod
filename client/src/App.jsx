import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { MoviePage } from './pages/MoviePage.jsx';
import { MoviesPage } from './pages/MoviesPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { AboutPage } from './pages/AboutPage.jsx';
import { ProjectPage } from './pages/ProjectPage.jsx';
import { SeatsPage } from './pages/SeatsPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { OrderPage } from './pages/OrderPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { StaffGuard } from './staff/StaffGuard.jsx';
import { StaffLayout } from './staff/StaffLayout.jsx';
import { StaffSellPage } from './staff/StaffSellPage.jsx';
import { StaffCheckPage } from './staff/StaffCheckPage.jsx';
import { StaffOrdersPage } from './staff/StaffOrdersPage.jsx';
import { StaffShiftPage } from './staff/StaffShiftPage.jsx';
import { AdminGuard } from './admin/AdminGuard.jsx';
import { AdminLayout } from './admin/AdminLayout.jsx';
import { AdminMoviesPage } from './admin/AdminMoviesPage.jsx';
import { AdminSessionsPage } from './admin/AdminSessionsPage.jsx';
import { AdminPricesPage } from './admin/AdminPricesPage.jsx';
import { AdminHallsPage } from './admin/AdminHallsPage.jsx';
import { AdminUsersPage } from './admin/AdminUsersPage.jsx';
import { AdminReviewsPage } from './admin/AdminReviewsPage.jsx';
import { AdminWordFilterPage } from './admin/AdminWordFilterPage.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="movies" element={<MoviesPage />} />
        <Route path="movies/:id" element={<MoviePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="project" element={<ProjectPage />} />
        <Route path="seats/:sessionId" element={<SeatsPage />} />
        <Route path="checkout/:sessionId" element={<CheckoutPage />} />
        <Route path="orders/:orderId" element={<OrderPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="staff"
        element={
          <StaffGuard>
            <StaffLayout />
          </StaffGuard>
        }
      >
        <Route index element={<StaffSellPage />} />
        <Route path="check" element={<StaffCheckPage />} />
        <Route path="orders" element={<StaffOrdersPage />} />
        <Route path="shift" element={<StaffShiftPage />} />
      </Route>
      <Route
        path="admin"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<AdminMoviesPage />} />
        <Route path="sessions" element={<AdminSessionsPage />} />
        <Route path="prices" element={<AdminPricesPage />} />
        <Route path="halls" element={<AdminHallsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="word-filter" element={<AdminWordFilterPage />} />
      </Route>
    </Routes>
  );
}
